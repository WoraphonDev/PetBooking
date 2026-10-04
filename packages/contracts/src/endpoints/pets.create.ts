import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { PetDetail } from "../dto/pet-detail.ts";
import { coatType, petSex, species } from "../enums.ts";
export const PetFields = z
  .object({
    name: z.string().min(1).max(40),
    species,
    speciesOther: z.string().optional(),
    breed: z.string().max(60).optional(),
    sex: petSex.optional(),
    birthDate: LocalDate.pipe(z.iso.date()).optional(),
    ageEstimateMonths: z.number().int().min(0).max(360).optional(),
    neutered: z.boolean().optional(),
    color: z.string().optional(),
    microchipNo: z
      .string()
      .regex(/^\d{15}$/)
      .optional(),
    coatType,
    profileFileId: Uuid.optional(),
  })
  .strict();
export const validPetSpecies = (p: { species: string; speciesOther?: string | null }) => p.species !== "other" || !!p.speciesOther?.trim();
export const PetsCreateParams = z.object({ customerId: Uuid });
export const PetsCreateRequest = PetFields.extend({ weightGrams: z.number().int().min(100).max(150000).optional() }).refine(
  validPetSpecies,
);
export type PetsCreateRequest = z.infer<typeof PetsCreateRequest>;
export const PetsCreateResponse = PetDetail;
export type PetsCreateResponse = z.infer<typeof PetsCreateResponse>;
