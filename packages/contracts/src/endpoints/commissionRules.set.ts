import { z } from "zod";
import { Uuid } from "../common.ts";
import { CommissionRuleItem } from "../dto/commission-rule-item.ts";
import { commissionType } from "../enums.ts";

const CommissionRuleInput = z
  .object({
    serviceId: Uuid.nullable().optional(),
    staffUserId: Uuid.nullable().optional(),
    type: commissionType,
    value: z.number().int().min(0),
  })
  // percent = basis points 0–10000; fixed = satang
  .refine((r) => r.type !== "percent" || r.value <= 10000, { path: ["value"], message: "percent must be 0–10000 bps" });

export const CommissionRulesSetRequest = z.object({ rules: z.array(CommissionRuleInput) }).superRefine((b, issue) => {
  const seen = new Set<string>();
  b.rules.forEach((r, i) => {
    const key = `${r.serviceId ?? "*"}|${r.staffUserId ?? "*"}`;
    if (seen.has(key)) issue.addIssue({ code: "custom", path: ["rules", i], message: "duplicate serviceId + staffUserId" });
    seen.add(key);
  });
});
export type CommissionRulesSetRequest = z.infer<typeof CommissionRulesSetRequest>;
export const CommissionRulesSetResponse = z.array(CommissionRuleItem);
export type CommissionRulesSetResponse = z.infer<typeof CommissionRulesSetResponse>;
