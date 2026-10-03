import { z } from "zod";
import { Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsVoidParams = z.object({ billId: Uuid });
export const BillsVoidRequest = z.object({ reason: z.string().trim().min(3) });
export type BillsVoidRequest = z.infer<typeof BillsVoidRequest>;
export const BillsVoidResponse = BillDetail;
export type BillsVoidResponse = z.infer<typeof BillsVoidResponse>;
