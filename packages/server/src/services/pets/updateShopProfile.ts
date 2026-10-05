import type { PetsUpdateShopProfileRequest, PetsUpdateShopProfileResponse } from "@app/contracts/endpoints/pets.updateShopProfile";
import { petPhoto, petShopProfile } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { petDetail, requirePet } from "./get.ts";

/**
 * 05#ep-pets.updateShopProfile: this shop's profile of the pet; fields left out stay, null clears. Vet phone by R-22
 * (INVALID_PHONE); the favourite style photo must be a pet_photo of this pet in this shop (else VALIDATION_FAILED).
 */
export async function petsUpdateShopProfile(
  ctx: RequestContext,
  input: PetsUpdateShopProfileRequest & { petId: string },
): Promise<PetsUpdateShopProfileResponse> {
  requireRole(ctx, "pets.updateShopProfile");
  const { petId, ...fields } = input;
  if (fields.vetClinicPhone) {
    const p = normalizePhone({ input: fields.vetClinicPhone });
    if (p.error || !p.e164) throw new AppError(p.error ?? "INVALID_PHONE", { field: "vetClinicPhone" });
    fields.vetClinicPhone = p.e164;
  }
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const { shop } = await requirePet(ctx, tx, petId);
    if (fields.favoriteStylePhotoId) {
      const [photo] = await db.select(petPhoto, and(eq(petPhoto.id, fields.favoriteStylePhotoId), eq(petPhoto.petId, petId)));
      if (!photo) throw new AppError("VALIDATION_FAILED", { fields: { favoriteStylePhotoId: "not a photo of this pet" } });
    }
    if (Object.keys(fields).length) await db.update(petShopProfile, { ...fields, updatedAt: ctx.now }, eq(petShopProfile.id, shop.id));
    return petDetail(ctx, tx, petId);
  });
}
