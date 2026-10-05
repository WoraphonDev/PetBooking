import { z } from "zod";
import { Uuid } from "../common.ts";
import { VaccinationItem } from "../dto/vaccination-item.ts";

export const VaccinationsRejectParams = z.object({ vaccinationId: Uuid });
export const VaccinationsRejectRequest = z.object({ reason: z.string().trim().min(3).max(500) });
export type VaccinationsRejectRequest = z.infer<typeof VaccinationsRejectRequest>;
export const VaccinationsRejectResponse = VaccinationItem;
export type VaccinationsRejectResponse = z.infer<typeof VaccinationsRejectResponse>;
