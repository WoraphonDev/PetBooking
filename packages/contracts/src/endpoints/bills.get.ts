import { z } from "zod";
import { Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsGetParams = z.object({ billId: Uuid });
export const BillsGetRequest = BillsGetParams;
export type BillsGetRequest = z.infer<typeof BillsGetRequest>;
export const BillsGetResponse = BillDetail;
export type BillsGetResponse = z.infer<typeof BillsGetResponse>;
