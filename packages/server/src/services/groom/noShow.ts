import type { GroomNoShowRequest, GroomNoShowResponse } from "@app/contracts/endpoints/groom.noShow";
import { booking, branch, branchPolicy, customer, daycareVisit, groomAppointment, pet, stay } from "@app/db/schema";
import { computeReliability } from "@app/domain/customer/reliability";
import { formatTHB } from "@app/domain/format/thai";
import { computeCancellation } from "@app/domain/payment/cancellation";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;
type PolicySnapshot = Partial<Record<string, unknown>>;
const MINUTE = 60_000;
/** a child in one of these no longer needs serving and nothing was delivered */
const NOT_SERVED = ["no_show", "cancelled"];

/**
 * 05#ep-groom.noShow: scheduled → no_show once now ≥ starts_at + no_show_grace_minutes (else STATUS_NOT_ALLOWED, Q-0097),
 * audit booking.no_show, customer.no_show_count_12m + 1 → R-09. When every child of the booking is no-show/cancelled the
 * booking closes and R-07 no_show forfeits a verified deposit; customer.no_show moneyLine names it (Q-0097).
 */
export async function groomNoShow(
  ctx: RequestContext,
  input: GroomNoShowRequest & { appointmentId: string },
): Promise<GroomNoShowResponse> {
  requireRole(ctx, "groom.noShow");
  const reason = input.reason || null;
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, a.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    const [br] = (await db.select(branch, eq(branch.id, a.branchId))) as (typeof branch.$inferSelect)[];
    if (!bk || !br) throw new AppError("NOT_FOUND");
    // branch_policy is keyed by the org-checked branch; a missing row means the column default (30)
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
    const allowedFrom = new Date(a.startsAt.getTime() + (policy?.noShowGraceMinutes ?? 30) * MINUTE);
    if (a.status === "scheduled" && ctx.now < allowedFrom)
      throw new AppError("STATUS_NOT_ALLOWED", { allowedFrom: allowedFrom.toISOString() });

    const updated = (await transition(tx, ctx, {
      table: groomAppointment,
      id: a.id,
      machine: "groom_appointment",
      to: "no_show",
      reason,
    })) as Appt;
    await writeAudit(tx, ctx, {
      action: "booking.no_show",
      entityType: "groom_appointment",
      entityId: a.id,
      reason,
      before: { status: a.status },
      after: { status: "no_show", bookingId: bk.id },
    });

    // R-09: one more no-show in the last 12 months (completed visits cannot lift the level once a no-show counts)
    const [c] = (await db.select(customer, eq(customer.id, bk.customerId)).for("update")) as (typeof customer.$inferSelect)[];
    if (!c) throw new AppError("NOT_FOUND");
    const noShows = c.noShowCount12m + 1;
    const { level } = computeReliability({
      noShowCount12m: noShows,
      lateCancelCount12m: c.lateCancelCount12m,
      completedVisits12m: 0,
      override: null,
    });
    await db.update(customer, { noShowCount12m: noShows, reliabilityLevel: level, updatedAt: ctx.now }, eq(customer.id, c.id));

    // every child ended without service → R-07 no_show on the deposit, booking closed
    const statuses = [
      ...((await db.select(groomAppointment, eq(groomAppointment.bookingId, bk.id))) as Appt[]).map((x) =>
        x.id === a.id ? "no_show" : x.status,
      ),
      ...((await db.select(stay, eq(stay.bookingId, bk.id))) as (typeof stay.$inferSelect)[]).map((x) => x.status),
      ...((await db.select(daycareVisit, eq(daycareVisit.bookingId, bk.id))) as (typeof daycareVisit.$inferSelect)[]).map((x) => x.status),
    ];
    let forfeit = 0;
    if (bk.status === "confirmed" && statuses.every((s) => NOT_SERVED.includes(s))) {
      if (bk.depositStatus === "verified") {
        // R-07 uses the policy as booked; branch_policy column defaults fill keys an old snapshot lacks
        const snap = bk.policySnapshot as PolicySnapshot;
        forfeit = computeCancellation({
          now: ctx.now.toISOString(),
          firstServiceAt: (bk.firstServiceAt ?? a.startsAt).toISOString(),
          modules: ["grooming"],
          kind: "no_show",
          depositVerifiedSatang: bk.depositVerifiedSatang,
          policySnapshot: {
            groomingFreeCancelHours: Number(snap.groomingFreeCancelHours ?? 24),
            hotelFreeCancelHours: Number(snap.hotelFreeCancelHours ?? 72),
            daycareFreeCancelHours: Number(snap.daycareFreeCancelHours ?? 24),
            lateCancelForfeitPercent: Number(snap.lateCancelForfeitPercent ?? 100),
            cancelRefundMode: (snap.cancelRefundMode as "refund" | "credit" | "customer_choice" | undefined) ?? "credit",
          },
        }).forfeitSatang;
        await transition(tx, ctx, { table: booking, id: bk.id, machine: "deposit", to: "forfeited", reason });
      }
      await transition(tx, ctx, { table: booking, id: bk.id, machine: "booking", to: "closed", reason });
    }

    // pet has no organization_id: reached through the org-checked appointment
    const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, a.petId));
    await enqueueNotification(
      tx,
      { ...ctx, branchId: br.id, timezone: br.timezone },
      {
        key: "customer.no_show",
        recipient: { type: "customer", id: bk.customerId },
        payload: {
          petName: p?.name ?? "",
          moneyLine: forfeit > 0 ? `มัดจำ ${formatTHB({ satang: forfeit })} ถูกริบตามนโยบายร้าน` : "",
          bookAgainUrl: new URL(`/liff/${br.bookingSlug}`, process.env.APP_BASE_URL).toString(),
        },
        dedupeKey: `no_show:${a.id}`,
      },
    );
    return updated;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
