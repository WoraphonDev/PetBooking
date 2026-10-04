import type { PetsSetStatusRequest, PetsSetStatusResponse } from "@app/contracts/endpoints/pets.setStatus";
import { branch, daycareVisit, groomAppointment, pet, stay } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, gt, gte } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { cancelJobs } from "../../jobs/schedule.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { petDetail, requirePet } from "./get.ts";

/**
 * 05#ep-pets.setStatus: pet.status + status_changed_at; deceased/rehomed cancels this shop's pending next_groom_reminder
 * jobs for the pet (Q-0105). Future bookings stay as they are: warning FUTURE_BOOKINGS {bookingIds} lists this shop's
 * bookings with a scheduled appointment after now or a reserved stay / daycare visit from today on (Q-0105).
 * `note` has no column in 05 and is not stored.
 */
export async function petsSetStatus(ctx: RequestContext, input: PetsSetStatusRequest & { petId: string }): Promise<PetsSetStatusResponse> {
  requireRole(ctx, "pets.setStatus");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const { p } = await requirePet(ctx, tx, input.petId);
    // pet has no organization_id: requirePet checked this shop's profile of it
    if (p.status !== input.status)
      await tx.update(pet).set({ status: input.status, statusChangedAt: ctx.now, updatedAt: ctx.now }).where(eq(pet.id, p.id));
    const detail = await petDetail(ctx, tx, p.id);
    if (input.status === "active") return detail;

    await cancelJobs(tx, `next_groom:${p.id}:`, ctx);
    const [br] = ctx.branchId ? ((await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[]) : [];
    const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: br?.timezone ?? ctx.timezone });
    const rows = [
      ...(await db.select(
        groomAppointment,
        and(eq(groomAppointment.petId, p.id), eq(groomAppointment.status, "scheduled"), gt(groomAppointment.startsAt, ctx.now)),
      )),
      ...(await db.select(stay, and(eq(stay.petId, p.id), eq(stay.status, "reserved"), gte(stay.checkInDate, today)))),
      ...(await db.select(
        daycareVisit,
        and(eq(daycareVisit.petId, p.id), eq(daycareVisit.status, "reserved"), gte(daycareVisit.visitDate, today)),
      )),
    ] as { bookingId: string }[];
    const bookingIds = [...new Set(rows.map((r) => r.bookingId))];
    if (bookingIds.length === 0) return detail;
    return {
      ...detail,
      warnings: [{ code: "FUTURE_BOOKINGS", message: "น้องยังมีใบจองที่ยังไม่ถึงวัน กรุณาตรวจสอบ", data: { bookingIds } }],
    };
  });
}
