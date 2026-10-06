import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { coatType, petSex, species } from "../enums.ts";
import { PhotoItem } from "./photo-item.ts";
import { VaccinationItem } from "./vaccination-item.ts";

/** 05#dto-MyPet — no internal_note */
export const MyPet = z.object({
  id: Uuid,
  name: z.string(),
  species,
  speciesOther: z.string().nullable(),
  breed: z.string().nullable(),
  sex: petSex,
  birthDate: LocalDate.nullable(),
  ageEstimateMonths: z.number().int().nullable(),
  neutered: z.boolean().nullable(),
  coatType,
  latestWeightGrams: z.number().int().nullable(),
  photoUrl: z.string().nullable(),
  sharedNote: z.string().nullable(),
  vaccinations: z.array(VaccinationItem),
  photos: z.array(PhotoItem),
  nextGroomDue: LocalDate.nullable(),
});
export type MyPet = z.infer<typeof MyPet>;
