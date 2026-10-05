import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

export const StaysCheckInParams = z.object({ stayId: Uuid });
export const StaysCheckInRequest = z.object({
  weightGrams: z.number().int().positive().optional(),
  /** required when R-11 fails (checked in the service) */
  vaccineOverrideReason: z.string().trim().max(500).optional(),
});
export type StaysCheckInRequest = z.infer<typeof StaysCheckInRequest>;
export const StaysCheckInResponse = StayDetail;
export type StaysCheckInResponse = z.infer<typeof StaysCheckInResponse>;
