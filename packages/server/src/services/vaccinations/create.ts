import type { VaccinationItem } from "@app/contracts/dto/vaccination-item";
import type { VaccinationsCreateRequest, VaccinationsCreateResponse } from "@app/contracts/endpoints/vaccinations.create";
import { branch, petVaccination, vaccineType } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile, signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { requirePet } from "../pets/get.ts";

type VaccinationRow = typeof petVaccination.$inferSelect;

/** 05#dto-VaccinationItem (vaccine name from vaccine_type, signed proof URL) */
export async function vaccinationItem(ctx: RequestContext, db: Executor, row: VaccinationRow): Promise<VaccinationItem> {
  const [type] = await db.select({ nameTh: vaccineType.nameTh }).from(vaccineType).where(eq(vaccineType.code, row.vaccineCode));
  return {
    id: row.id,
    vaccineCode: row.vaccineCode,
    vaccineName: type?.nameTh ?? row.vaccineCode,
    administeredOn: row.administeredOn,
    expiresOn: row.expiresOn,
    status: row.status,
    source: row.source,
    proofUrl: row.proofFileId ? await signedUrl(db, ctx, row.proofFileId) : null,
    rejectReason: row.rejectReason,
  };
}

/** a pet_vaccination of a pet this shop knows (pet_vaccination is shared and has no tenant key), or NOT_FOUND */
export async function shopVaccination(ctx: RequestContext, db: Executor, id: string): Promise<VaccinationRow> {
  const [row] = await db.select().from(petVaccination).where(eq(petVaccination.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  await requirePet(ctx, db, row.petId);
  return row;
}

/** calendar date `months` after a local date, clamped to the month's last day */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/**
 * 05#ep-vaccinations.create: the shop records a vaccination → verified, source shop, verified_org_id/by/at. The code must be a
 * vaccine_type of the pet's species, administeredOn ≤ today (branch-local), expiresOn defaults to administeredOn + the type's
 * default validity; a proof must be a vaccine_proof file.
 */
export async function vaccinationsCreate(
  ctx: RequestContext,
  input: VaccinationsCreateRequest & { petId: string },
): Promise<VaccinationsCreateResponse> {
  requireRole(ctx, "vaccinations.create");
  const actorId = ctx.actor.id;
  if (!actorId || !ctx.orgId) throw new AppError("FORBIDDEN");
  const row = await withTx(ctx, async (tx) => {
    const { p } = await requirePet(ctx, tx, input.petId);
    const [type] = await tx.select().from(vaccineType).where(eq(vaccineType.code, input.vaccineCode));
    if (!type || type.species !== p.species)
      throw new AppError("VALIDATION_FAILED", { fields: { vaccineCode: "not a vaccine for this species" } });
    const [br] = ctx.branchId
      ? ((await tenantDb(ctx, tx).select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[])
      : [];
    const today = toLocalDate({ instant: ctx.now.toISOString(), timezone: br?.timezone ?? ctx.timezone });
    if (input.administeredOn && input.administeredOn > today)
      throw new AppError("VALIDATION_FAILED", { fields: { administeredOn: "cannot be in the future" } });
    const expiresOn = input.expiresOn ?? addMonths(input.administeredOn as string, type.defaultValidityMonths);
    if (input.proofFileId) await commitFile(tx, ctx, input.proofFileId, "vaccine_proof");
    const [created] = await tx
      .insert(petVaccination)
      .values({
        petId: p.id,
        vaccineCode: type.code,
        administeredOn: input.administeredOn ?? null,
        expiresOn,
        proofFileId: input.proofFileId ?? null,
        status: "verified",
        source: "shop",
        verifiedOrgId: ctx.orgId,
        verifiedBy: actorId,
        verifiedAt: ctx.now,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    if (!created) throw new Error("vaccinations.create: no inserted row");
    return created;
  });
  return vaccinationItem(ctx, getDb(), row);
}
