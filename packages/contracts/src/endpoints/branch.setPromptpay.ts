import { z } from "zod";
import { BranchSettings } from "../dto/branch-settings.ts";
import { promptpayType } from "../enums.ts";

export const BranchSetPromptpayRequest = z.object({
  type: promptpayType,
  // R-30 format per type is checked in the service (INVALID_PROMPTPAY_ID)
  id: z.string().min(1),
  accountName: z.string().trim().min(1).max(80),
  password: z.string().min(1),
});
export type BranchSetPromptpayRequest = z.infer<typeof BranchSetPromptpayRequest>;
export const BranchSetPromptpayResponse = BranchSettings;
export type BranchSetPromptpayResponse = z.infer<typeof BranchSetPromptpayResponse>;
