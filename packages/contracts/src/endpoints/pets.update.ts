import { z } from "zod";
import { Uuid } from "../common.ts";
import { PetDetail } from "../dto/pet-detail.ts";
import { PetFields } from "./pets.create.ts";
export const PetsUpdateParams = z.object({ petId: Uuid });
export const PetsUpdateRequest = PetFields.partial();
export type PetsUpdateRequest = z.infer<typeof PetsUpdateRequest>;
export const PetsUpdateResponse = PetDetail;
export type PetsUpdateResponse = z.infer<typeof PetsUpdateResponse>;
