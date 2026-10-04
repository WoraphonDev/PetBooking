import { z } from "zod";
import { Uuid } from "../common.ts";
import { ReportCardDetail } from "../dto/report-card-detail.ts";
import { earCondition, nailCondition, parasiteFinding, skinCondition, teethCondition } from "../enums.ts";

export const ReportCardsUpdateParams = z.object({ reportCardId: Uuid });
/** fields left out keep their value; null clears */
export const ReportCardsUpdateRequest = z.object({
  skin: skinCondition.nullable().optional(),
  ears: earCondition.nullable().optional(),
  nails: nailCondition.nullable().optional(),
  teeth: teethCondition.nullable().optional(),
  parasites: parasiteFinding.nullable().optional(),
  cooperation: z.number().int().min(1).max(5).nullable().optional(),
  /** shown to the customer */
  staffNote: z.string().trim().max(500).nullable().optional(),
  recommendation: z.string().trim().max(300).nullable().optional(),
});
export type ReportCardsUpdateRequest = z.infer<typeof ReportCardsUpdateRequest>;
export const ReportCardsUpdateResponse = ReportCardDetail;
export type ReportCardsUpdateResponse = z.infer<typeof ReportCardsUpdateResponse>;
