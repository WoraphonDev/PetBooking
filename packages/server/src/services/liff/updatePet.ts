import type { LiffUpdatePetRequest, LiffUpdatePetResponse } from "@app/contracts/endpoints/liff.updatePet";
import { pet, petWeight } from "@app/db/schema";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { validatePet } from "../pets/create.ts";
import { myPet, requireMyPet } from "./pets.ts";

export async function liffUpdatePet(ctx: RequestContext, input: LiffUpdatePetRequest & { petId: string }): Promise<LiffUpdatePetResponse> {
  return withTx(ctx, async (tx) => {
    const p = await requireMyPet(ctx, tx, input.petId);
    const { petId, weightGrams, ...fields } = input;
    validatePet(ctx, { ...p, ...fields });
    if (input.profileFileId) await commitFile(tx, ctx, input.profileFileId, "pet_profile");
    await tx
      .update(pet)
      .set({ ...fields, ...(weightGrams !== undefined ? { latestWeightGrams: weightGrams } : {}), updatedAt: ctx.now })
      .where(eq(pet.id, petId));
    if (weightGrams !== undefined)
      await tenantDb(ctx, tx).insert(petWeight, { petId, weightGrams, measuredAt: ctx.now, source: "customer", createdAt: ctx.now });
    return myPet(ctx, tx, petId);
  });
}
