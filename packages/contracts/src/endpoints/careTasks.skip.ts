import { z } from "zod";
import { Uuid } from "../common.ts";
import { CareTaskItem } from "../dto/care-task-item.ts";

export const CareTasksSkipParams = z.object({ taskId: Uuid });
export const CareTasksSkipRequest = z.object({ note: z.string().trim().min(3).max(200) });
export type CareTasksSkipRequest = z.infer<typeof CareTasksSkipRequest>;
export const CareTasksSkipResponse = CareTaskItem;
export type CareTasksSkipResponse = z.infer<typeof CareTasksSkipResponse>;
