import { z } from "zod";
import { Uuid } from "../common.ts";
import { commissionType } from "../enums.ts";

/** 05#dto-CommissionRuleItem */
export const CommissionRuleItem = z.object({
  id: Uuid,
  serviceId: Uuid.nullable(),
  staffUserId: Uuid.nullable(),
  type: commissionType,
  value: z.number().int(),
});
export type CommissionRuleItem = z.infer<typeof CommissionRuleItem>;
