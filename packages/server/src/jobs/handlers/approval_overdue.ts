import { booking, branch, branchPolicy, daycareVisit, groomAppointment, refund, staffUser, stay } from "@app/db/schema";
import { computeCancellation } from "@app/domain/payment/cancellation";
import * as daycareState from "@app/domain/state/daycare_visit";
import * as groomState from "@app/domain/state/groom_appointment";
import * as stayState from "@app/domain/state/stay";
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import type { JobHandler } from "../runner.ts";
import { scheduleJob } from "../schedule.ts";

const MINUTE_MS = 60_000;
const children = [
  { table: groomAppointment, machine: "groom_appointment", module: "grooming", canTransition: groomState.canTransition },
  { table: stay, machine: "stay", module: "hotel", canTransition: stayState.canTransition },
  { table: daycareVisit, machine: "daycare_visit", module: "daycare", canTransition: daycareState.canTransition },
] as const;

/**
 * 07 §2 approval_overdue: still awaiting_approval → past first_service_at: expired (R-07 shop_cancel), otherwise
 * staff.approval_overdue to front_desk+owner and the next round after approval_timeout_minutes.
 */
export const handler: JobHandler = async (tx, ctx, job) => {
  const { bookingId, n } = job.payload as { bookingId: string; n: number };
  const db = tenantDb(ctx, tx);
  const [bk] = (await db.select(booking, eq(booking.id, bookingId)).for("update")) as (typeof booking.$inferSelect)[];
  if (bk?.status !== "awaiting_approval") return;
  const [br] = (await db.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new Error("approval_overdue: booking branch missing");
  const branchCtx = { ...ctx, branchId: br.id, timezone: br.timezone };

  if (bk.firstServiceAt && ctx.now >= bk.firstServiceAt) {
    await transition(tx, ctx, { table: booking, id: bk.id, machine: "booking", to: "expired" });
    const modules: ("grooming" | "hotel" | "daycare")[] = [];
    for (const child of children) {
      const rows = (await db.select(child.table, eq(child.table.bookingId, bk.id))) as { id: string; status: string }[];
      if (rows.length) modules.push(child.module);
      for (const row of rows)
        if (child.canTransition(row.status as never, "cancelled"))
          await transition(tx, ctx, { table: child.table, id: row.id, machine: child.machine, to: "cancelled" });
    }
    if (bk.depositStatus !== "verified" || bk.depositVerifiedSatang <= 0) return;
    const result = computeCancellation({
      now: ctx.now.toISOString(),
      firstServiceAt: bk.firstServiceAt.toISOString(),
      modules: modules.length ? modules : ["grooming"],
      kind: "shop_cancel",
      depositVerifiedSatang: bk.depositVerifiedSatang,
      policySnapshot: bk.policySnapshot as Parameters<typeof computeCancellation>[0]["policySnapshot"],
    });
    if (result.returnMode !== "refund") return;
    // Q-0068: refund.created_by must be staff — a system job records the organization's first active owner
    const [owner] = (await db.select(
      staffUser,
      and(eq(staffUser.role, "owner"), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    if (!owner) throw new Error("approval_overdue: no active owner to record the refund");
    const [row] = (await db.insert(refund, {
      bookingId: bk.id,
      customerId: bk.customerId,
      amountSatang: result.returnSatang,
      mode: "bank_transfer",
      reason: "job:approval_overdue",
      createdBy: owner.id,
      createdAt: ctx.now,
    })) as (typeof refund.$inferSelect)[];
    if (!row) throw new Error("approval_overdue: refund not created");
    await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to: "refunded" });
    await writeAudit(tx, ctx, {
      action: "refund.create",
      entityType: "refund",
      entityId: row.id,
      after: { bookingId: bk.id, amountSatang: row.amountSatang, mode: row.mode, createdBy: owner.id },
      reason: "job:approval_overdue",
    });
    return;
  }

  // branch_policy is keyed by the org-checked branch; a missing row means the column default
  const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
  const timeoutMs = (policy?.approvalTimeoutMinutes ?? 120) * MINUTE_MS;
  // Q-0068: waiting started approval_timeout_minutes before approval_due_at
  const since = bk.approvalDueAt ? bk.approvalDueAt.getTime() - timeoutMs : bk.createdAt.getTime();
  const staff = (await db.select(
    staffUser,
    and(inArray(staffUser.role, ["front_desk", "owner"]), eq(staffUser.status, "active")),
  )) as (typeof staffUser.$inferSelect)[];
  for (const member of staff)
    await enqueueNotification(tx, branchCtx, {
      key: "staff.approval_overdue",
      recipient: { type: "staff", id: member.id },
      payload: { bookingNo: bk.bookingNo, waitedMinutes: Math.max(0, Math.floor((ctx.now.getTime() - since) / MINUTE_MS)) },
      dedupeKey: `approval_overdue:${bk.id}:${n}`,
    });
  const next = new Date(ctx.now.getTime() + timeoutMs);
  await scheduleJob(tx, {
    type: "approval_overdue",
    // never later than the first service, so the expiry is not delayed by a long timeout
    runAt: bk.firstServiceAt && bk.firstServiceAt < next ? bk.firstServiceAt : next,
    payload: { bookingId: bk.id, n: n + 1 },
    orgId: ctx.orgId,
    dedupeKey: `approval_overdue:${bk.id}:${n + 1}`,
  });
};
