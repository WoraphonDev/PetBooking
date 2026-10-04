import { z } from "zod";
import { Uuid } from "../common.ts";
import { PetDetail } from "../dto/pet-detail.ts";
export const PetsGetRequest = z.object({ petId: Uuid });
export type PetsGetRequest = z.infer<typeof PetsGetRequest>;
export const PetsGetResponse = PetDetail;
export type PetsGetResponse = z.infer<typeof PetsGetResponse>;
