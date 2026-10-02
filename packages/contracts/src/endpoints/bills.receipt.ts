import { z } from "zod";
import { Uuid } from "../common.ts";
import { Receipt } from "../dto/receipt.ts";

export const BillsReceiptParams = z.object({ billId: Uuid });
export const BillsReceiptRequest = BillsReceiptParams;
export type BillsReceiptRequest = z.infer<typeof BillsReceiptRequest>;
export const BillsReceiptResponse = Receipt;
export type BillsReceiptResponse = z.infer<typeof BillsReceiptResponse>;
