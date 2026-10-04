import type { PetsUpdateRequest, PetsUpdateResponse } from "@app/contracts/endpoints/pets.update";
import { pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { commitFile } from "../../files.ts";
import { validatePet } from "./create.ts";
import { petDetail, requirePet } from "./get.ts";
export async function petsUpdate(ctx: RequestContext, input: PetsUpdateRequest & { petId: string }): Promise<PetsUpdateResponse> {
  requireRole(ctx, "pets.update");
  return withTx(ctx, async (tx) => {
    const { p } = await requirePet(ctx, tx, input.petId);
    const { petId, ...fields } = input;
    validatePet(ctx, { ...p, ...fields });
    if (input.profileFileId) await commitFile(tx, ctx, input.profileFileId, "pet_profile");
    await tx
      .update(pet)
      .set({ ...fields, updatedAt: ctx.now })
      .where(eq(pet.id, petId));
    return petDetail(ctx, tx, petId);
  });
}
