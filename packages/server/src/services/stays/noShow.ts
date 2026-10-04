import type { StaysNoShowRequest, StaysNoShowResponse } from "@app/contracts/endpoints/stays.noShow";
import { booking, branch, customer, daycareVisit, groomAppointment, pet, stay } from "@app/db/schema";
import { computeReliability } from "@app/domain/customer/reliability";
import { formatTHB } from "@app/domain/format/thai";
import { computeCancellation } from "@app/domain/payment/cancellation";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { bookingDetail } from "../bookings/get.ts";

type Booking = typeof booking.$inferSelect;
type PolicySnapshot = Partial<Record<string, unknown>>;
/** a child in one of these no longer needs serving and nothing was delivered */
const NOT_SERVED = ["no_show", "cancelled"];

/**
 * After a child went no_show (same transaction): customer.no_show_count_12m + 1 → R-09, and when every child of the
 * booking is no-show/cancelled the booking closes and R-07 no_show forfeits a verified deposit (as groom.noShow).
 * Returns the forfeited amount.
 */
export async function recordNoShow(tx: Tx, ctx: RequestContext, bk: Booking, reason: string | null): Promise<number> {
  const db = tenantDb(ctx, tx);
  const [c] = (await db.select(customer, eq(customer.id, bk.customerId)).for("update")) as (typeof customer.$inferSelect)[];
  if (!c) throw new AppError("NOT_FOUND");
  const noShows = c.noShowCount12m + 1;
  // completed visits cannot lift the level once a no-show counts
  const { level } = computeReliability({
    noShowCount12m: noShows,
    lateCancelCount12m: c.lateCancelCount12m,
    completedVisits12m: 0,
    override: null,
  });
  await db.update(customer, { noShowCount12m: noShows, reliabilityLevel: level, updatedAt: ctx.now }, eq(customer.id, c.id));

  const kids = [
    ...((await db.select(groomAppointment, eq(groomAppointment.bookingId, bk.id))) as { status: string }[]).map((x) => ({
      module: "grooming" as const,
      status: x.status,
    })),
    ...((await db.select(stay, eq(stay.bookingId, bk.id))) as { status: string }[]).map((x) => ({
      module: "hotel" as const,
      status: x.status,
    })),
    ...((await db.select(daycareVisit, eq(daycareVisit.bookingId, bk.id))) as { status: string }[]).map((x) => ({
      module: "daycare" as const,
      status: x.status,
    })),
  ];
  if (bk.status !== "confirmed" || !kids.every((k) => NOT_SERVED.includes(k.status))) return 0;
  let forfeit = 0;
  if (bk.depositStatus === "verified") {
    // R-07 uses the policy as booked; branch_policy column defaults fill keys an old snapshot lacks
    const snap = bk.policySnapshot as PolicySnapshot;
    forfeit = computeCancellation({
      now: ctx.now.toISOString(),
      firstServiceAt: (bk.firstServiceAt ?? ctx.now).toISOString(),
      modules: [...new Set(kids.map((k) => k.module))],
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
  return forfeit;
}

/**
 * 05#ep-stays.noShow: reserved → no_show from the check-in date on (branch local day; earlier → STATUS_NOT_ALLOWED
 * {allowedFrom}, the UI confirms before 23:59 — Q-0104), audit booking.no_show, R-09, R-07 when the booking ends,
 * customer.no_show (07 §1, moneyLine as Q-0097).
 */
export async function staysNoShow(ctx: RequestContext, input: StaysNoShowRequest): Promise<StaysNoShowResponse> {
  requireRole(ctx, "stays.noShow");
  const bookingId = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId))) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, s.bookingId)).for("update")) as Booking[];
    const [br] = (await db.select(branch, eq(branch.id, s.branchId))) as (typeof branch.$inferSelect)[];
    if (!bk || !br) throw new AppError("NOT_FOUND");
    if (s.status === "reserved" && toLocalDate({ instant: ctx.now.toISOString(), timezone: br.timezone }) < s.checkInDate)
      throw new AppError("STATUS_NOT_ALLOWED", { allowedFrom: s.checkInDate });

    await transition(tx, ctx, { table: stay, id: s.id, machine: "stay", to: "no_show" });
    await writeAudit(tx, ctx, {
      action: "booking.no_show",
      entityType: "stay",
      entityId: s.id,
      before: { status: s.status },
      after: { status: "no_show", bookingId: bk.id },
    });
    const forfeit = await recordNoShow(tx, ctx, bk, null);

    // pet has no organization_id: reached through the org-checked stay
    const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, s.petId));
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
        dedupeKey: `no_show:${s.id}`,
      },
    );
    return bk.id;
  });
  const card = (await bookingDetail(ctx, getDb(), bookingId)).stays.find((x) => x.id === input.stayId);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
