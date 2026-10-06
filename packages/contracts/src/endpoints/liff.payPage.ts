import { z } from "zod";
import { Uuid } from "../common.ts";
import { PaymentInstruction } from "../dto/payment-instruction.ts";

export const LiffPayPageParams = z.object({ branchSlug: z.string().min(1), billId: Uuid });
export const LiffPayPageRequest = LiffPayPageParams;
export type LiffPayPageRequest = z.infer<typeof LiffPayPageRequest>;
export const LiffPayPageResponse = PaymentInstruction;
export type LiffPayPageResponse = z.infer<typeof LiffPayPageResponse>;
