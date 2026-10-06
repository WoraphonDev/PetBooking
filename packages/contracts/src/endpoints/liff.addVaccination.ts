import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { VaccinationItem } from "../dto/vaccination-item.ts";

export const LiffAddVaccinationParams = z.object({ branchSlug: z.string().min(1), petId: Uuid });
export const LiffAddVaccinationRequest = z
  .object({
    vaccineCode: z.string().min(1),
    administeredOn: LocalDate.optional(),
    expiresOn: LocalDate,
    /** a vaccine_proof file */
    proofFileId: Uuid,
  })
  .strict();
export type LiffAddVaccinationRequest = z.infer<typeof LiffAddVaccinationRequest>;
export const LiffAddVaccinationResponse = VaccinationItem;
export type LiffAddVaccinationResponse = z.infer<typeof LiffAddVaccinationResponse>;
