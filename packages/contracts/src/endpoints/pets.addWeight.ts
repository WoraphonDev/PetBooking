import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { PetDetail } from "../dto/pet-detail.ts";

export const PetsAddWeightParams = z.object({ petId: Uuid });
export const PetsAddWeightRequest = z.object({
  weightGrams: z.number().int().min(100).max(150_000),
  /** default now */
  measuredAt: IsoInstant.optional(),
});
export type PetsAddWeightRequest = z.infer<typeof PetsAddWeightRequest>;
export const PetsAddWeightResponse = PetDetail;
export type PetsAddWeightResponse = z.infer<typeof PetsAddWeightResponse>;
