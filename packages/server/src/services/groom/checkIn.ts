import type { Warning } from "@app/contracts/common";
import type { GroomCheckInRequest, GroomCheckInResponse } from "@app/contracts/endpoints/groom.checkIn";
import {
  booking,
  branch,
  branchPolicy,
  consentDocument,
  groomAppointment,
  groomAppointmentItem,
  pet,
  petWeight,
  servicePrice,
  sizeTier,
} from "@app/db/schema";
import { lookupServicePrice } from "@app/domain/pricing/price-lookup";
import { resolveSizeTier } from "@app/domain/pricing/size-tier";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { defaultPlanId } from "../availability/hotel.ts";
import { appointmentCards } from "../bookings/get.ts";

type Appt = typeof groomAppointment.$inferSelect;
/** these conditions need a signed grooming consent */
const NEEDS_CONSENT = ["matted", "skin_issue"];

/**
 * 05#ep-groom.checkIn: scheduled → checked_in, today only and booking confirmed (or awaiting_deposit paid at the
 * counter) — else STATUS_NOT_ALLOWED (03 guard). Weight → weight_grams_checkin + pet_weight + pet.latest_weight_grams;
 * matted/skin_issue need a consent (CONSENT_REQUIRED) whose body is branch_policy.grooming_consent_text now.
 * A weight that moves the pet to another size tier answers warnings[SIZE_CHANGED {newPriceSatang}] for groom.setItems.
 */
export async function groomCheckIn(
  ctx: RequestContext,
  input: GroomCheckInRequest & { appointmentId: string },
): Promise<GroomCheckInResponse> {
  requireRole(ctx, "groom.checkIn");
  const reasons = input.consent?.reasons ?? [];
  const { row, warnings } = await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [a] = (await db.select(groomAppointment, eq(groomAppointment.id, input.appointmentId))) as Appt[];
    if (!a) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, a.bookingId))) as (typeof booking.$inferSelect)[];
    const [br] = (await db.select(branch, eq(branch.id, a.branchId))) as (typeof branch.$inferSelect)[];
    if (!bk || !br) throw new AppError("NOT_FOUND");
    if (a.status === "scheduled") {
      const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: br.timezone });
      const day = toLocalDate({ instant: a.startsAt.toISOString(), timezone: br.timezone });
      if (day !== today || !["confirmed", "awaiting_deposit"].includes(bk.status))
        throw new AppError("STATUS_NOT_ALLOWED", { appointmentDate: day, bookingStatus: bk.status });
    }
    if (input.conditionFlags.some((f) => NEEDS_CONSENT.includes(f)) && reasons.length === 0) throw new AppError("CONSENT_REQUIRED");

    const updated = (await transition(tx, ctx, {
      table: groomAppointment,
      id: a.id,
      machine: "groom_appointment",
      to: "checked_in",
      extraSet: {
        checkedInAt: ctx.now,
        conditionFlags: input.conditionFlags,
        conditionNote: input.conditionNote ?? null,
        ...(input.weightGrams !== undefined ? { weightGramsCheckin: input.weightGrams } : {}),
      },
    })) as Appt;

    if (reasons.length && input.consent?.signatureFileId && input.consent.signerName) {
      await commitFile(tx, ctx, input.consent.signatureFileId, "signature");
      // branch_policy is keyed by the org-checked branch; a missing row means the column default ("")
      const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
      await db.insert(consentDocument, {
        kind: "grooming_consent",
        appointmentId: a.id,
        customerId: bk.customerId,
        reasons,
        bodySnapshot: policy?.groomingConsentText ?? "",
        signerName: input.consent.signerName,
        signatureFileId: input.consent.signatureFileId,
        signedAt: ctx.now,
        createdAt: ctx.now,
      });
    }

    const warnings: Warning[] = [];
    if (input.weightGrams !== undefined) {
      await db.insert(petWeight, {
        petId: a.petId,
        weightGrams: input.weightGrams,
        measuredAt: ctx.now,
        source: "shop",
        recordedBy: ctx.actor.type === "staff" ? ctx.actor.id : null,
        appointmentId: a.id,
        createdAt: ctx.now,
      });
      // pet is shared across shops: reached through the org-checked appointment; latest_weight_grams caches pet_weight
      const [p] = await tx
        .update(pet)
        .set({ latestWeightGrams: input.weightGrams, updatedAt: ctx.now })
        .where(eq(pet.id, a.petId))
        .returning();

      // R-01 with the new weight; a different tier → the price the shop would get from groom.setItems
      if (p && p.species !== "other") {
        const tiers = (await db.select(sizeTier, eq(sizeTier.branchId, br.id))) as (typeof sizeTier.$inferSelect)[];
        const { tierId } = resolveSizeTier({
          species: p.species,
          weightGrams: input.weightGrams,
          tiers: tiers.flatMap((t) => (t.species === "other" ? [] : [{ ...t, species: t.species }])),
        });
        if (tierId !== a.sizeTierId) {
          const items = (await db.select(
            groomAppointmentItem,
            eq(groomAppointmentItem.appointmentId, a.id),
          )) as (typeof groomAppointmentItem.$inferSelect)[];
          const planId = await defaultPlanId(ctx, tx, br.id);
          const prices =
            planId && items.length
              ? ((await db.select(
                  servicePrice,
                  and(
                    eq(servicePrice.ratePlanId, planId),
                    inArray(
                      servicePrice.serviceId,
                      items.map((i) => i.serviceId),
                    ),
                  ),
                )) as (typeof servicePrice.$inferSelect)[])
              : [];
          const found = items.map((i) =>
            lookupServicePrice({ serviceId: i.serviceId, sizeTierId: tierId, coatGroup: a.coatGroup, prices }),
          );
          warnings.push({
            code: "SIZE_CHANGED",
            message: "น้ำหนักวันนี้ทำให้ขนาดเปลี่ยน ราคาอาจเปลี่ยน",
            data: {
              newSizeTierId: tierId,
              newPriceSatang: found.every(Boolean) ? found.reduce((s, f) => s + (f?.priceSatang ?? 0), 0) : null,
            },
          });
        }
      }
    }
    return { row: updated, warnings };
  });
  const [card] = await appointmentCards(ctx, getDb(), [row]);
  if (!card) throw new AppError("NOT_FOUND");
  return warnings.length ? { ...card, warnings } : card;
}
