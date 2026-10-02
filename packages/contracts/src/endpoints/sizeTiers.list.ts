import { z } from "zod";
import { SizeTierItem } from "../dto/size-tier-item.ts";

/** no query parameters (organization/branch come from the session) */
export const SizeTiersListRequest = z.strictObject({});
export type SizeTiersListRequest = z.infer<typeof SizeTiersListRequest>;
export const SizeTiersListResponse = z.array(SizeTierItem);
export type SizeTiersListResponse = z.infer<typeof SizeTiersListResponse>;
