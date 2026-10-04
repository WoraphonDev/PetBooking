import { z } from "zod";
import { Uuid } from "../common.ts";
import { DaycareVisitItem } from "../dto/daycare-visit-item.ts";

export const DaycareCancelParams = z.object({ visitId: Uuid });
export const DaycareCancelRequest = z.object({ reason: z.string().trim().min(1).max(500) });
export type DaycareCancelRequest = z.infer<typeof DaycareCancelRequest>;
export const DaycareCancelResponse = DaycareVisitItem;
export type DaycareCancelResponse = z.infer<typeof DaycareCancelResponse>;
