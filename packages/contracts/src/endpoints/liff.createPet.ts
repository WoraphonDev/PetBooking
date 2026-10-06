import { z } from "zod";
import { MyPet } from "../dto/my-pet.ts";
import { petSex } from "../enums.ts";
import { PetFields } from "./pets.create.ts";

export const LiffCreatePetParams = z.object({ branchSlug: z.string().min(1) });
/** 05#ep-liff.createPet: the staff pet fields a customer may set; sex is required in LIFF */
export const LiffPetFields = PetFields.pick({
  name: true,
  species: true,
  breed: true,
  birthDate: true,
  ageEstimateMonths: true,
  neutered: true,
  coatType: true,
  profileFileId: true,
}).extend({ sex: petSex, weightGrams: z.number().int().min(100).max(150000).optional() });
export const LiffCreatePetRequest = LiffPetFields;
export type LiffCreatePetRequest = z.infer<typeof LiffCreatePetRequest>;
export const LiffCreatePetResponse = MyPet;
export type LiffCreatePetResponse = z.infer<typeof LiffCreatePetResponse>;
