import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

export const StaysCheckOutParams = z.object({ stayId: Uuid });
export const StaysCheckOutRequest = z.object({
  weightGramsOut: z.number().int().positive().optional(),
  /** every belonging handed back now; the rest needs missingNote */
  returnedBelongingIds: z.array(Uuid),
  missingNote: z.string().trim().max(500).optional(),
});
export type StaysCheckOutRequest = z.infer<typeof StaysCheckOutRequest>;
export const StaysCheckOutResponse = StayDetail;
export type StaysCheckOutResponse = z.infer<typeof StaysCheckOutResponse>;
