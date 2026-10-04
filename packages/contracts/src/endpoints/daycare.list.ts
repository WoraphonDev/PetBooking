import { z } from "zod";
import { LocalDate } from "../common.ts";
import { DaycareVisitItem } from "../dto/daycare-visit-item.ts";

export const DaycareListQuery = z.strictObject({ date: LocalDate });
export const DaycareListRequest = DaycareListQuery;
export type DaycareListRequest = z.infer<typeof DaycareListRequest>;
export const DaycareListResponse = z.array(DaycareVisitItem);
export type DaycareListResponse = z.infer<typeof DaycareListResponse>;
