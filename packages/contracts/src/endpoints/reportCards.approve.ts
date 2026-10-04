import { z } from "zod";
import { Uuid } from "../common.ts";
import { ReportCardDetail } from "../dto/report-card-detail.ts";

export const ReportCardsApproveParams = z.object({ reportCardId: Uuid });
export const ReportCardsApproveRequest = ReportCardsApproveParams;
export type ReportCardsApproveRequest = z.infer<typeof ReportCardsApproveRequest>;
export const ReportCardsApproveResponse = ReportCardDetail;
export type ReportCardsApproveResponse = z.infer<typeof ReportCardsApproveResponse>;
