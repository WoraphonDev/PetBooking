import { z } from "zod";
import { Uuid } from "../common.ts";
import { LinkRequestItem } from "../dto/link-request-item.ts";

export const LinkRequestsApproveRequest = z.object({ requestId: Uuid });
export type LinkRequestsApproveRequest = z.infer<typeof LinkRequestsApproveRequest>;
export const LinkRequestsApproveResponse = LinkRequestItem;
export type LinkRequestsApproveResponse = z.infer<typeof LinkRequestsApproveResponse>;
