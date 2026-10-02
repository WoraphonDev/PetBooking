import { z } from "zod";
import { Uuid } from "../common.ts";

export const BillsSendReceiptParams = z.object({ billId: Uuid });
export const BillsSendReceiptRequest = BillsSendReceiptParams;
export type BillsSendReceiptRequest = z.infer<typeof BillsSendReceiptRequest>;
/** 204 No Content */
export const BillsSendReceiptResponse = z.undefined();
export type BillsSendReceiptResponse = z.infer<typeof BillsSendReceiptResponse>;
