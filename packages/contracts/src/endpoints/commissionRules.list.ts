import { z } from "zod";
import { CommissionRuleItem } from "../dto/commission-rule-item.ts";

/** no query parameters (organization/branch come from the session) */
export const CommissionRulesListRequest = z.strictObject({});
export type CommissionRulesListRequest = z.infer<typeof CommissionRulesListRequest>;
export const CommissionRulesListResponse = z.array(CommissionRuleItem);
export type CommissionRulesListResponse = z.infer<typeof CommissionRulesListResponse>;
