import { z } from "zod";
import { LinkRequestItem } from "../dto/link-request-item.ts";

/** no query parameters (organization comes from the session) */
export const LinkRequestsListRequest = z.strictObject({});
export type LinkRequestsListRequest = z.infer<typeof LinkRequestsListRequest>;
export const LinkRequestsListResponse = z.array(LinkRequestItem);
export type LinkRequestsListResponse = z.infer<typeof LinkRequestsListResponse>;
