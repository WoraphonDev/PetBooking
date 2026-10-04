import { z } from "zod";
import { Uuid } from "../common.ts";
import { ReportCardDetail } from "../dto/report-card-detail.ts";

export const ReportCardsGetParams = z.object({ reportCardId: Uuid });
export const ReportCardsGetRequest = ReportCardsGetParams;
export type ReportCardsGetRequest = z.infer<typeof ReportCardsGetRequest>;
export const ReportCardsGetResponse = ReportCardDetail;
export type ReportCardsGetResponse = z.infer<typeof ReportCardsGetResponse>;
