import { z } from "zod";
import { Uuid } from "../common.ts";
import { coatType, petSex, petStatus, species, temperamentFlag } from "../enums.ts";

/** 05#dto-PetSummary — a pet in short form. */
export const PetSummary = z.object({
  id: Uuid,
  name: z.string(),
  species,
  breed: z.string().nullable(),
  sex: petSex,
  coatType,
  latestWeightGrams: z.number().int().nullable(),
  status: petStatus,
  /** signed URL of pet.profile_file_id — null until object storage (T-0038) is wired in */
  photoUrl: z.string().nullable(),
  flags: z.array(temperamentFlag),
  /** R-12 ageInMonths; null when neither birth date nor estimate is known */
  ageMonths: z.number().int().nullable(),
  /** R-11 against the branch's required vaccines today */
  vaccineStatus: z.enum(["ok", "warning", "missing"]),
});
export type PetSummary = z.infer<typeof PetSummary>;
