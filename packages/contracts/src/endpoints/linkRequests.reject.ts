import { z } from "zod";
import { Uuid } from "../common.ts";
import { LinkRequestItem } from "../dto/link-request-item.ts";

export const LinkRequestsRejectRequest = z.object({ requestId: Uuid });
export type LinkRequestsRejectRequest = z.infer<typeof LinkRequestsRejectRequest>;
export const LinkRequestsRejectResponse = LinkRequestItem;
export type LinkRequestsRejectResponse = z.infer<typeof LinkRequestsRejectResponse>;
