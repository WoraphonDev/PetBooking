import { z } from "zod";
import { Uuid } from "../common.ts";
import { PetDetail } from "../dto/pet-detail.ts";

const text = (max = 500) => z.string().trim().max(max).nullable();
export const PetsUpdateShopProfileParams = z.object({ petId: Uuid });
/** fields left out stay as they are; null clears */
export const PetsUpdateShopProfileRequest = z
  .object({
    preferredStyle: text(200),
    bladeNo: text(20),
    shampooOk: text(),
    shampooAvoid: text(),
    allergies: text(),
    conditions: text(),
    medications: text(),
    vetClinicName: text(200),
    /** R-22 (normalised in the service) */
    vetClinicPhone: z.string().min(1).nullable(),
    internalNote: text(2000),
    /** the customer sees it */
    sharedNote: text(1000),
    /** a pet_photo of this pet */
    favoriteStylePhotoId: Uuid.nullable(),
    groomIntervalDays: z.number().int().min(7).max(180).nullable(),
  })
  .partial()
  .strict();
export type PetsUpdateShopProfileRequest = z.infer<typeof PetsUpdateShopProfileRequest>;
export const PetsUpdateShopProfileResponse = PetDetail;
export type PetsUpdateShopProfileResponse = z.infer<typeof PetsUpdateShopProfileResponse>;
