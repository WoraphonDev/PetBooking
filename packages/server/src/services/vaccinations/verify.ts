import type { VaccinationsVerifyRequest, VaccinationsVerifyResponse } from "@app/contracts/endpoints/vaccinations.verify";
import { petVaccination } from "@app/db/schema";
import { canTransition } from "@app/domain/state/pet_vaccination";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { shopVaccination, vaccinationItem } from "./create.ts";

/** 05#ep-vaccinations.verify: pending_review → verified (verified_org_id/by/at); expiresOn may be corrected first */
export async function vaccinationsVerify(
  ctx: RequestContext,
  input: VaccinationsVerifyRequest & { vaccinationId: string },
): Promise<VaccinationsVerifyResponse> {
  requireRole(ctx, "vaccinations.verify");
  const row = await withTx(ctx, async (tx) => {
    const v = await shopVaccination(ctx, tx, input.vaccinationId);
    if (!canTransition(v.status, "verified")) throw new AppError("INVALID_TRANSITION");
    // pet_vaccination is shared (no tenant key): reached through the org-checked pet; the status guard makes it race-safe
    const [updated] = await tx
      .update(petVaccination)
      .set({
        status: "verified",
        expiresOn: input.expiresOn ?? v.expiresOn,
        verifiedOrgId: ctx.orgId,
        verifiedBy: ctx.actor.id,
        verifiedAt: ctx.now,
        updatedAt: ctx.now,
      })
      .where(and(eq(petVaccination.id, v.id), eq(petVaccination.status, v.status)))
      .returning();
    if (!updated) throw new AppError("INVALID_TRANSITION");
    return updated;
  });
  return vaccinationItem(ctx, getDb(), row);
}
