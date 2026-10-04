import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { recordSource, vaccineStatus } from "../enums.ts";
export const VaccinationItem = z.object({
  id: Uuid,
  vaccineCode: z.string(),
  vaccineName: z.string(),
  administeredOn: LocalDate.nullable(),
  expiresOn: LocalDate,
  status: vaccineStatus,
  source: recordSource,
  proofUrl: z.string().nullable(),
  rejectReason: z.string().nullable(),
});
export type VaccinationItem = z.infer<typeof VaccinationItem>;
