import { type PetsCreateRequest, type PetsCreateResponse, validPetSpecies } from "@app/contracts/endpoints/pets.create";
import { customer, pet, petShopProfile, petWeight } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { petDetail } from "./get.ts";
export function validatePet(
  ctx: RequestContext,
  input: { species: string; speciesOther?: string | null; birthDate?: string | null },
): void {
  if (
    !validPetSpecies(input) ||
    (input.birthDate && input.birthDate > toLocalDate({ instant: ctx.now.toISOString(), timezone: ctx.timezone }))
  )
    throw new AppError("VALIDATION_FAILED");
}
export async function petsCreate(ctx: RequestContext, input: PetsCreateRequest & { customerId: string }): Promise<PetsCreateResponse> {
  requireRole(ctx, "pets.create");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [owner] = (await db.select(customer, eq(customer.id, input.customerId))) as (typeof customer.$inferSelect)[];
    if (!owner) throw new AppError("NOT_FOUND");
    validatePet(ctx, input);
    if (input.profileFileId) await commitFile(tx, ctx, input.profileFileId, "pet_profile");
    const { customerId: _customerId, weightGrams, ...fields } = input;
    const [created] = await tx
      .insert(pet)
      .values({
        ...fields,
        ownerProfileId: owner.ownerProfileId,
        createdInOrgId: ctx.orgId!,
        latestWeightGrams: weightGrams ?? null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    if (!created) throw new Error("Pet insert returned no row");
    await db.insert(petShopProfile, { petId: created.id, createdAt: ctx.now, updatedAt: ctx.now });
    if (weightGrams !== undefined)
      await db.insert(petWeight, {
        petId: created.id,
        weightGrams,
        measuredAt: ctx.now,
        source: "shop",
        recordedBy: ctx.actor.id,
        createdAt: ctx.now,
      });
    return petDetail(ctx, tx, created.id);
  });
}
