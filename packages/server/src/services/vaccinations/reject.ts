import type { VaccinationsRejectRequest, VaccinationsRejectResponse } from "@app/contracts/endpoints/vaccinations.reject";
import { branch, customer, pet, petVaccination, vaccineType } from "@app/db/schema";
import { canTransition } from "@app/domain/state/pet_vaccination";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { shopVaccination, vaccinationItem } from "./create.ts";

/**
 * 05#ep-vaccinations.reject: pending_review → rejected with the reason; customer.vaccine_rejected {petName, vaccineName, reason,
 * petUrl = L-03 page of the pet} to the pet's owner as this shop's customer (dedupe vaccine_rejected:{vaccinationId}).
 */
export async function vaccinationsReject(
  ctx: RequestContext,
  input: VaccinationsRejectRequest & { vaccinationId: string },
): Promise<VaccinationsRejectResponse> {
  requireRole(ctx, "vaccinations.reject");
  const row = await withTx(ctx, async (tx) => {
    const v = await shopVaccination(ctx, tx, input.vaccinationId);
    if (!canTransition(v.status, "rejected")) throw new AppError("INVALID_TRANSITION");
    const [updated] = await tx
      .update(petVaccination)
      .set({ status: "rejected", rejectReason: input.reason, updatedAt: ctx.now })
      .where(and(eq(petVaccination.id, v.id), eq(petVaccination.status, v.status)))
      .returning();
    if (!updated) throw new AppError("INVALID_TRANSITION");

    const db = tenantDb(ctx, tx);
    const [p] = await tx.select().from(pet).where(eq(pet.id, v.petId));
    const [owner] = p
      ? ((await db.select(customer, eq(customer.ownerProfileId, p.ownerProfileId))) as (typeof customer.$inferSelect)[])
      : [];
    const [br] = ctx.branchId ? ((await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[]) : [];
    const [type] = await tx.select({ nameTh: vaccineType.nameTh }).from(vaccineType).where(eq(vaccineType.code, v.vaccineCode));
    if (owner && br)
      await enqueueNotification(
        tx,
        { ...ctx, branchId: br.id, timezone: br.timezone },
        {
          key: "customer.vaccine_rejected",
          recipient: { type: "customer", id: owner.id },
          payload: {
            petName: p?.name ?? "",
            vaccineName: type?.nameTh ?? v.vaccineCode,
            reason: input.reason,
            petUrl: new URL(`/liff/${br.bookingSlug}/pets/${v.petId}`, process.env.APP_BASE_URL).toString(),
          },
          dedupeKey: `vaccine_rejected:${v.id}`,
        },
      );
    return updated;
  });
  return vaccinationItem(ctx, getDb(), row);
}
