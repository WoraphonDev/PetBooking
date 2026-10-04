import { z } from "zod";
import { Uuid } from "../common.ts";
import { DaycareVisitItem } from "../dto/daycare-visit-item.ts";

export const DaycareNoShowParams = z.object({ visitId: Uuid });
export const DaycareNoShowRequest = z.object({ reason: z.string().trim().max(500).optional() });
export type DaycareNoShowRequest = z.infer<typeof DaycareNoShowRequest>;
export const DaycareNoShowResponse = DaycareVisitItem;
export type DaycareNoShowResponse = z.infer<typeof DaycareNoShowResponse>;
