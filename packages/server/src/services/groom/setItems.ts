import type { GroomSetItemsRequest, GroomSetItemsResponse } from "@app/contracts/endpoints/groom.setItems";
import { booking, branchPolicy, groomAppointment, groomAppointmentItem, service, servicePrice, sizeTier } from "@app/db/schema";
import { lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { and, eq, inArray } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { defaultPlanId } from "../availability/hotel.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;
type Item = typeof groomAppointmentItem.$inferSelect;
const MINUTE = 60_000;
/** items can still change before the work is done (Q-0100) */
const EDITABLE = ["scheduled", "checked_in", "in_progress"];

/**
 * 05#ep-groom.setItems: replaces the appointment's items with new R-02 price/duration snapshots (default plan, size tier
 * given or kept, the appointment's coat group); overrides are audited as booking.price_override. Ends/blocked_until follow
 * the new duration; a longer job that now overlaps hits the exclusion constraints → SLOT_TAKEN. The booking estimate
 * moves by the difference in services total. Package links survive for services that stay.
 */
export async function groomSetItems(
  ctx: RequestContext,
  input: GroomSetItemsRequest & { appointmentId: string },
): Promise<GroomSetItemsResponse> {
  requireRole(ctx, "groom.setItems");
  const row = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    if (!EDITABLE.includes(a.status)) throw new AppError("STATUS_NOT_ALLOWED", { status: a.status });

    const ids = [...input.serviceIds, ...input.addonIds];
    const services = (await db.select(
      service,
      and(eq(service.branchId, a.branchId), inArray(service.id, ids)),
    )) as (typeof service.$inferSelect)[];
    if (services.length !== ids.length) throw new AppError("NOT_FOUND");
    const fields: Record<string, string> = {};
    input.serviceIds.forEach((id, i) => {
      const s = services.find((x) => x.id === id);
      if (s && (s.scope !== "grooming" || s.isAddon || s.status !== "active"))
        fields[`serviceIds.${i}`] = "must be an active main grooming service";
    });
    input.addonIds.forEach((id, i) => {
      const s = services.find((x) => x.id === id);
      if (s && (s.scope !== "grooming" || !s.isAddon || s.status !== "active"))
        fields[`addonIds.${i}`] = "must be an active grooming add-on";
    });
    if (Object.keys(fields).length) throw new AppError("VALIDATION_FAILED", { fields });

    let tierId = a.sizeTierId;
    if (input.sizeTierId) {
      const [tier] = await db.select(sizeTier, and(eq(sizeTier.id, input.sizeTierId), eq(sizeTier.branchId, a.branchId)));
      if (!tier) throw new AppError("NOT_FOUND");
      tierId = input.sizeTierId;
    }
    const planId = await defaultPlanId(ctx, tx, a.branchId);
    const prices = planId
      ? ((await db.select(
          servicePrice,
          and(eq(servicePrice.ratePlanId, planId), inArray(servicePrice.serviceId, ids)),
        )) as (typeof servicePrice.$inferSelect)[])
      : [];
    const old = (await db.select(groomAppointmentItem, eq(groomAppointmentItem.appointmentId, a.id))) as Item[];
    const lines = ids.map((serviceId) => {
      const found = lookupServicePrice({ serviceId, sizeTierId: tierId, coatGroup: a.coatGroup, prices });
      if (!found) throw new AppError("PRICE_NOT_FOUND");
      const s = services.find((x) => x.id === serviceId) as typeof service.$inferSelect;
      const override = input.priceOverrides.find((o) => o.serviceId === serviceId);
      return {
        serviceId,
        isAddon: s.isAddon,
        nameSnapshot: s.nameTh,
        catalogSatang: found.priceSatang,
        priceSatang: override ? override.priceSatang : found.priceSatang,
        durationMinutes: found.durationMinutes,
        customerPackageId: old.find((o) => o.serviceId === serviceId)?.customerPackageId ?? null,
        override,
      };
    });

    // branch_policy is keyed by the org-checked branch; a missing row means the column default
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, a.branchId));
    const duration = lines.reduce((s, l) => s + l.durationMinutes, 0);
    if (duration <= 0) throw new AppError("VALIDATION_FAILED", { fields: { serviceIds: "total duration must be > 0" } });
    const total = lines.reduce((s, l) => s + l.priceSatang, 0);
    const endsAt = new Date(a.startsAt.getTime() + duration * MINUTE);

    await tx
      .delete(groomAppointmentItem)
      .where(and(eq(groomAppointmentItem.organizationId, a.organizationId), eq(groomAppointmentItem.appointmentId, a.id)));
    await db.insert(
      groomAppointmentItem,
      lines.map(({ catalogSatang: _c, override: _o, ...l }) => ({ appointmentId: a.id, ...l, createdAt: ctx.now })),
    );
    // a longer job is checked by groom_appt_*_no_overlap → mapPgError → SLOT_TAKEN
    const [updated] = (await db.update(
      groomAppointment,
      {
        sizeTierId: tierId,
        servicesTotalSatang: total,
        endsAt,
        blockedUntil: new Date(endsAt.getTime() + (policy?.bufferMinutes ?? 10) * MINUTE),
        updatedAt: ctx.now,
      },
      eq(groomAppointment.id, a.id),
    )) as Appt[];
    if (!updated) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, a.bookingId)).for("update")) as (typeof booking.$inferSelect)[];
    if (bk)
      await db.update(
        booking,
        { estimatedTotalSatang: Math.max(0, bk.estimatedTotalSatang + total - a.servicesTotalSatang), updatedAt: ctx.now },
        eq(booking.id, bk.id),
      );

    for (const l of lines.filter((x) => x.override))
      await writeAudit(tx, ctx, {
        action: "booking.price_override",
        entityType: "groom_appointment",
        entityId: a.id,
        reason: l.override?.reason ?? null,
        before: { serviceId: l.serviceId, priceSatang: l.catalogSatang },
        after: { serviceId: l.serviceId, priceSatang: l.priceSatang },
      });
    return updated;
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
