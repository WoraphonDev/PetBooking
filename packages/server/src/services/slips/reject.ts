import type { SlipsRejectRequest, SlipsRejectResponse } from "@app/contracts/endpoints/slips.reject";
import { booking, branch, branchPolicy, daycareVisit, groomAppointment, paymentSlip, stay } from "@app/db/schema";
import { formatThaiDate, formatTime } from "@app/domain/format/thai";
import * as daycareState from "@app/domain/state/daycare_visit";
import * as groomState from "@app/domain/state/groom_appointment";
import * as stayState from "@app/domain/state/stay";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { cancelJobs, scheduleJob } from "../../jobs/schedule.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { slipItems } from "./list.ts";

type SlipRow = typeof paymentSlip.$inferSelect;
const MINUTE = 60_000;
const children = [
  { table: groomAppointment, machine: "groom_appointment", canTransition: groomState.canTransition },
  { table: stay, machine: "stay", canTransition: stayState.canTransition },
  { table: daycareVisit, machine: "daycare_visit", canTransition: daycareState.canTransition },
] as const;

/**
 * 05#ep-slips.reject: submitted → rejected (reason shown to the customer, reviewer), audit slip.reject. A deposit slip
 * of a booking in deposit_review (R-08 step 4): first rejection → awaiting_deposit with a new hold = now + hold_minutes
 * (expire_hold job) and customer.slip_rejected; the second → expired, children cancelled, customer.hold_expired (Q-0102).
 */
export async function slipsReject(ctx: RequestContext, input: SlipsRejectRequest & { slipId: string }): Promise<SlipsRejectResponse> {
  requireRole(ctx, "slips.reject");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(paymentSlip, eq(paymentSlip.id, input.slipId))) as SlipRow[];
    if (!s) throw new AppError("NOT_FOUND");
    const updated = (await transition(tx, ctx, {
      table: paymentSlip,
      id: s.id,
      machine: "payment_slip",
      to: "rejected",
      extraSet: { rejectReason: input.reason, reviewedBy: ctx.actor.id, reviewedAt: ctx.now },
    })) as SlipRow;
    await writeAudit(tx, ctx, {
      action: "slip.reject",
      entityType: "payment_slip",
      entityId: s.id,
      reason: input.reason,
      before: { status: s.status },
      after: { status: "rejected", bookingId: s.bookingId, billId: s.billId },
    });

    const [br] = (await db.select(branch, eq(branch.id, s.branchId))) as (typeof branch.$inferSelect)[];
    if (!br) throw new AppError("NOT_FOUND");
    const notifyCtx = { ...ctx, branchId: br.id, timezone: br.timezone };
    const link = (path: string) => new URL(`/liff/${br.bookingSlug}${path}`, process.env.APP_BASE_URL).toString();
    const [bk] = s.bookingId
      ? ((await db.select(booking, eq(booking.id, s.bookingId)).for("update")) as (typeof booking.$inferSelect)[])
      : [];

    if (bk?.status === "deposit_review") {
      await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to: "rejected", reason: input.reason });
      const rejected = await db.select(paymentSlip, and(eq(paymentSlip.bookingId, bk.id), eq(paymentSlip.status, "rejected")));
      if (rejected.length >= 2) {
        // R-08 step 4: one chance to fix → the second rejection releases the queue
        await transition(tx, ctx, {
          table: booking,
          id: bk.id,
          machine: "booking",
          to: "expired",
          reason: input.reason,
          extraSet: { holdExpiresAt: null },
        });
        for (const child of children)
          for (const c of (await db.select(child.table, eq(child.table.bookingId, bk.id))) as { id: string; status: string }[])
            if (child.canTransition(c.status as never, "cancelled"))
              await transition(tx, ctx, { table: child.table, id: c.id, machine: child.machine, to: "cancelled", reason: input.reason });
        await cancelJobs(tx, `expire_hold:${bk.id}:`, ctx);
        await enqueueNotification(tx, notifyCtx, {
          key: "customer.hold_expired",
          recipient: { type: "customer", id: bk.customerId },
          // Q-0061: book again from the LIFF home (L-02)
          payload: { bookingNo: bk.bookingNo, bookAgainUrl: link("") },
          dedupeKey: `hold_expired:${bk.id}`,
        });
        return updated;
      }
      // branch_policy is keyed by the org-checked branch; a missing row means the column default (15)
      const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
      const hold = new Date(ctx.now.getTime() + (policy?.holdMinutes ?? 15) * MINUTE);
      await transition(tx, ctx, {
        table: booking,
        id: bk.id,
        machine: "booking",
        to: "awaiting_deposit",
        reason: input.reason,
        extraSet: { holdExpiresAt: hold },
      });
      await scheduleJob(tx, {
        type: "expire_hold",
        runAt: hold,
        payload: { bookingId: bk.id },
        dedupeKey: `expire_hold:${bk.id}:${hold.toISOString()}`,
        orgId: bk.organizationId,
      });
      await enqueueNotification(tx, notifyCtx, {
        key: "customer.slip_rejected",
        recipient: { type: "customer", id: bk.customerId },
        payload: {
          bookingNo: bk.bookingNo,
          reason: input.reason,
          newDeadline: `${formatThaiDate({ date: toLocalDate({ instant: hold.toISOString(), timezone: br.timezone }) })} ${formatTime({ instant: hold.toISOString(), timezone: br.timezone })}`,
          // L-07 pay the deposit
          payUrl: link(`/bookings/${bk.id}/pay`),
        },
        dedupeKey: `slip_rejected:${s.id}`,
      });
    }
    return updated;
  });
  const [item] = await slipItems(ctx, getDb(), [row]);
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}
