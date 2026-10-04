import { z } from "zod";
import { Uuid } from "../common.ts";
import { DaycareVisitItem } from "../dto/daycare-visit-item.ts";

export const DaycareCheckInParams = z.object({ visitId: Uuid });
export const DaycareCheckInRequest = DaycareCheckInParams;
export type DaycareCheckInRequest = z.infer<typeof DaycareCheckInRequest>;
export const DaycareCheckInResponse = DaycareVisitItem;
export type DaycareCheckInResponse = z.infer<typeof DaycareCheckInResponse>;
