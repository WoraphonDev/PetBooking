import { z } from "zod";
import { DaycareSessionTypeItem } from "../dto/daycare-session-type-item.ts";

/** no query parameters (organization/branch come from the session) */
export const DaycareTypesListRequest = z.strictObject({});
export type DaycareTypesListRequest = z.infer<typeof DaycareTypesListRequest>;
export const DaycareTypesListResponse = z.array(DaycareSessionTypeItem);
export type DaycareTypesListResponse = z.infer<typeof DaycareTypesListResponse>;
