import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { VaccinationItem } from "../dto/vaccination-item.ts";

export const VaccinationsCreateParams = z.object({ petId: Uuid });
export const VaccinationsCreateRequest = z
  .object({
    vaccineCode: z.string().min(1),
    administeredOn: LocalDate.optional(),
    /** none = administeredOn + vaccine_type.default_validity_months */
    expiresOn: LocalDate.optional(),
    /** a vaccine_proof file */
    proofFileId: Uuid.optional(),
  })
  .refine((b) => b.administeredOn !== undefined || b.expiresOn !== undefined, {
    path: ["expiresOn"],
    message: "expiresOn or administeredOn is required",
  });
export type VaccinationsCreateRequest = z.infer<typeof VaccinationsCreateRequest>;
export const VaccinationsCreateResponse = VaccinationItem;
export type VaccinationsCreateResponse = z.infer<typeof VaccinationsCreateResponse>;
