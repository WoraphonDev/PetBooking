import { z } from "zod";
import { Uuid } from "../common.ts";
import { ReportCardDetail } from "../dto/report-card-detail.ts";

export const ReportCardsSubmitParams = z.object({ reportCardId: Uuid });
export const ReportCardsSubmitRequest = ReportCardsSubmitParams;
export type ReportCardsSubmitRequest = z.infer<typeof ReportCardsSubmitRequest>;
export const ReportCardsSubmitResponse = ReportCardDetail;
export type ReportCardsSubmitResponse = z.infer<typeof ReportCardsSubmitResponse>;
