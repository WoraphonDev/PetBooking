import { z } from "zod";
import { Uuid } from "../common.ts";
import { DataRequestItem } from "../dto/data-request-item.ts";

export const AdminResolveDataRequestParams = z.object({ requestId: Uuid });
/** 05#ep-admin.resolveDataRequest */
export const AdminResolveDataRequestRequest = z.object({
  status: z.enum(["done", "rejected"]),
  note: z.string().trim().max(2000).optional(),
});
export type AdminResolveDataRequestRequest = z.infer<typeof AdminResolveDataRequestRequest>;
export const AdminResolveDataRequestResponse = DataRequestItem;
export type AdminResolveDataRequestResponse = z.infer<typeof AdminResolveDataRequestResponse>;
