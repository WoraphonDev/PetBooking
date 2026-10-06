import { z } from "zod";
import { Uuid } from "../common.ts";
import { MyPet } from "../dto/my-pet.ts";
import { LiffPetFields } from "./liff.createPet.ts";

export const LiffUpdatePetParams = z.object({ branchSlug: z.string().min(1), petId: Uuid });
/** 05#ep-liff.updatePet: `<same as create>`, every field optional */
export const LiffUpdatePetRequest = LiffPetFields.partial();
export type LiffUpdatePetRequest = z.infer<typeof LiffUpdatePetRequest>;
export const LiffUpdatePetResponse = MyPet;
export type LiffUpdatePetResponse = z.infer<typeof LiffUpdatePetResponse>;
