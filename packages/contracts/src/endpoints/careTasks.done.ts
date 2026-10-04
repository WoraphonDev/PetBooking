import { z } from "zod";
import { Uuid } from "../common.ts";
import { CareTaskItem } from "../dto/care-task-item.ts";

export const CareTasksDoneParams = z.object({ taskId: Uuid });
export const CareTasksDoneRequest = z.object({ note: z.string().trim().max(200).optional(), photoFileId: Uuid.optional() });
export type CareTasksDoneRequest = z.infer<typeof CareTasksDoneRequest>;
export const CareTasksDoneResponse = CareTaskItem;
export type CareTasksDoneResponse = z.infer<typeof CareTasksDoneResponse>;
