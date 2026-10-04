import { z } from "zod";
import { Uuid } from "../common.ts";
import { DaycareVisitItem } from "../dto/daycare-visit-item.ts";

export const DaycareCheckOutParams = z.object({ visitId: Uuid });
export const DaycareCheckOutRequest = DaycareCheckOutParams;
export type DaycareCheckOutRequest = z.infer<typeof DaycareCheckOutRequest>;
export const DaycareCheckOutResponse = DaycareVisitItem;
export type DaycareCheckOutResponse = z.infer<typeof DaycareCheckOutResponse>;
