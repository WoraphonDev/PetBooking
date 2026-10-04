import { z } from "zod";
import { IsoInstant, LocalDate, Uuid } from "../common.ts";
import { coatType, petSex, petStatus, species } from "../enums.ts";
import { TemperamentFlagItem } from "./temperament-flag-item.ts";
import { VaccinationItem } from "./vaccination-item.ts";
import { WeightItem } from "./weight-item.ts";

const text = z.string().nullable();
export const PetDetail = z.object({
  id: Uuid,
  ownerProfileId: Uuid,
  name: z.string(),
  species,
  speciesOther: text,
  breed: text,
  sex: petSex,
  birthDate: LocalDate.nullable(),
  ageEstimateMonths: z.number().int().nullable(),
  neutered: z.boolean().nullable(),
  color: text,
  microchipNo: text,
  coatType,
  latestWeightGrams: z.number().int().nullable(),
  status: petStatus,
  photoUrl: text,
  shop: z.object({
    preferredStyle: text,
    bladeNo: text,
    shampooOk: text,
    shampooAvoid: text,
    allergies: text,
    conditions: text,
    medications: text,
    vetClinicName: text,
    vetClinicPhone: text,
    internalNote: text,
    sharedNote: text,
    favoriteStylePhotoUrl: text,
    groomIntervalDays: z.number().int().nullable(),
    lastGroomedAt: IsoInstant.nullable(),
  }),
  flags: z.array(TemperamentFlagItem),
  weights: z.array(WeightItem),
  vaccinations: z.array(VaccinationItem),
  nextGroomDue: LocalDate.nullable(),
});
export type PetDetail = z.infer<typeof PetDetail>;
