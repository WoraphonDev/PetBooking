import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { CareTaskItem } from "../dto/care-task-item.ts";
import { careTaskStatus } from "../enums.ts";

export const CareTasksListQuery = z.strictObject({ date: LocalDate, status: careTaskStatus.optional(), stayId: Uuid.optional() });
export const CareTasksListRequest = CareTasksListQuery;
export type CareTasksListRequest = z.infer<typeof CareTasksListRequest>;
export const CareTasksListResponse = z.array(CareTaskItem);
export type CareTasksListResponse = z.infer<typeof CareTasksListResponse>;
