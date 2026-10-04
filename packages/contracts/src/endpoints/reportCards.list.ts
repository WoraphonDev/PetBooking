import { z } from "zod";
import { ReportCardDetail } from "../dto/report-card-detail.ts";
import { reportCardStatus } from "../enums.ts";

export const ReportCardsListQuery = z.object({ status: reportCardStatus.optional() });
export type ReportCardsListQuery = z.infer<typeof ReportCardsListQuery>;
export const ReportCardsListRequest = ReportCardsListQuery;
export type ReportCardsListRequest = ReportCardsListQuery;
export const ReportCardsListResponse = z.array(ReportCardDetail);
export type ReportCardsListResponse = z.infer<typeof ReportCardsListResponse>;
