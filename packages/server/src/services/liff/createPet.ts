import type { LiffCreatePetRequest, LiffCreatePetResponse } from "@app/contracts/endpoints/liff.createPet";
import { pet, petShopProfile, petWeight } from "@app/db/schema";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { validatePet } from "../pets/create.ts";
import { liffCustomer, myPet } from "./pets.ts";

export async function liffCreatePet(ctx: RequestContext, input: LiffCreatePetRequest): Promise<LiffCreatePetResponse> {
  return withTx(ctx, async (tx) => {
    const cust = await liffCustomer(ctx, tx);
    // LIFF has no species_other field, so species = other fails here (pet_other_chk, Q-1034)
    validatePet(ctx, input);
    if (input.profileFileId) await commitFile(tx, ctx, input.profileFileId, "pet_profile");
    const { weightGrams, ...fields } = input;
    const [created] = await tx
      .insert(pet)
      .values({
        ...fields,
        ownerProfileId: cust.ownerProfileId,
        createdInOrgId: cust.organizationId,
        latestWeightGrams: weightGrams ?? null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    if (!created) throw new Error("Pet insert returned no row");
    const db = tenantDb(ctx, tx);
    await db.insert(petShopProfile, { petId: created.id, createdAt: ctx.now, updatedAt: ctx.now });
    if (weightGrams !== undefined)
      await db.insert(petWeight, { petId: created.id, weightGrams, measuredAt: ctx.now, source: "customer", createdAt: ctx.now });
    return myPet(ctx, tx, created.id);
  });
}
