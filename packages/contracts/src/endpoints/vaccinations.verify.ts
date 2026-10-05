import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { VaccinationItem } from "../dto/vaccination-item.ts";

export const VaccinationsVerifyParams = z.object({ vaccinationId: Uuid });
export const VaccinationsVerifyRequest = z.object({ expiresOn: LocalDate.optional() });
export type VaccinationsVerifyRequest = z.infer<typeof VaccinationsVerifyRequest>;
export const VaccinationsVerifyResponse = VaccinationItem;
export type VaccinationsVerifyResponse = z.infer<typeof VaccinationsVerifyResponse>;
