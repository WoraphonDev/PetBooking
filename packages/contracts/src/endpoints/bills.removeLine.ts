import { z } from "zod";
import { Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsRemoveLineRequest = z.object({ lineId: Uuid });
export type BillsRemoveLineRequest = z.infer<typeof BillsRemoveLineRequest>;
export const BillsRemoveLineResponse = BillDetail;
export type BillsRemoveLineResponse = z.infer<typeof BillsRemoveLineResponse>;
