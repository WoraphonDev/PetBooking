import { z } from "zod";
import { DataRequestItem } from "../dto/data-request-item.ts";

/** no query parameters */
export const AdminDataRequestsRequest = z.strictObject({});
export type AdminDataRequestsRequest = z.infer<typeof AdminDataRequestsRequest>;
export const AdminDataRequestsResponse = z.array(DataRequestItem);
export type AdminDataRequestsResponse = z.infer<typeof AdminDataRequestsResponse>;
