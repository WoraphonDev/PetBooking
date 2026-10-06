import type { LiffAddVaccinationRequest, LiffAddVaccinationResponse } from "@app/contracts/endpoints/liff.addVaccination";
import { petVaccination, staffUser, vaccineType } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { and, eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { vaccinationItem } from "../vaccinations/create.ts";
import { requireMyPet } from "./pets.ts";

/**
 * 05#ep-liff.addVaccination (one transaction): the customer's own pet (else NOT_FOUND) gets a pet_vaccination with
 * status pending_review, source customer and a committed vaccine_proof file. The code must be a vaccine_type of the pet's
 * species, administeredOn ≤ today (branch-local) and expiresOn ≥ administeredOn; staff.vaccine_review to active
 * front_desk (dedupe vaccine_review:{vaccinationId}).
 */
export async function liffAddVaccination(
  ctx: RequestContext,
  input: LiffAddVaccinationRequest & { petId: string },
): Promise<LiffAddVaccinationResponse> {
  return withTx(ctx, async (tx) => {
    const p = await requireMyPet(ctx, tx, input.petId);
    // vaccine_type is reference data (no tenant key)
    const [type] = await tx.select().from(vaccineType).where(eq(vaccineType.code, input.vaccineCode));
    if (!type || type.species !== p.species)
      throw new AppError("VALIDATION_FAILED", { fields: { vaccineCode: "not a vaccine for this species" } });
    const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: ctx.timezone });
    if (input.administeredOn && input.administeredOn > today)
      throw new AppError("VALIDATION_FAILED", { fields: { administeredOn: "cannot be in the future" } });
    if (input.administeredOn && input.expiresOn < input.administeredOn)
      throw new AppError("VALIDATION_FAILED", { fields: { expiresOn: "before administeredOn" } });
    await commitFile(tx, ctx, input.proofFileId, "vaccine_proof");
    const [row] = await tx
      .insert(petVaccination)
      .values({
        petId: p.id,
        vaccineCode: type.code,
        administeredOn: input.administeredOn ?? null,
        expiresOn: input.expiresOn,
        proofFileId: input.proofFileId,
        status: "pending_review",
        source: "customer",
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    if (!row) throw new Error("liff.addVaccination: no inserted row");

    const frontDesk = (await tenantDb(ctx, tx).select(
      staffUser,
      and(eq(staffUser.role, "front_desk"), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const member of frontDesk)
      await enqueueNotification(tx, ctx, {
        key: "staff.vaccine_review",
        recipient: { type: "staff", id: member.id },
        payload: { petName: p.name },
        dedupeKey: `vaccine_review:${row.id}`,
      });
    return vaccinationItem(ctx, tx, row);
  });
}
