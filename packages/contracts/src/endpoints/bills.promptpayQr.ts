import { z } from "zod";
import { Uuid } from "../common.ts";
import { PaymentInstruction } from "../dto/payment-instruction.ts";

export const BillsPromptpayQrParams = z.object({ billId: Uuid });
export const BillsPromptpayQrRequest = BillsPromptpayQrParams;
export type BillsPromptpayQrRequest = z.infer<typeof BillsPromptpayQrRequest>;
export const BillsPromptpayQrResponse = PaymentInstruction;
export type BillsPromptpayQrResponse = z.infer<typeof BillsPromptpayQrResponse>;
