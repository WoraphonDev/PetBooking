import { CommissionRulesListRequest } from "@app/contracts/endpoints/commissionRules.list";
import { CommissionRulesSetRequest } from "@app/contracts/endpoints/commissionRules.set";
import { withStaff } from "@app/server/http";
import { commissionRulesList } from "@app/server/services/commissionRules/list";
import { commissionRulesSet } from "@app/server/services/commissionRules/set";

export const GET = withStaff("commissionRules.list", { query: CommissionRulesListRequest }, commissionRulesList);
export const PUT = withStaff("commissionRules.set", { body: CommissionRulesSetRequest }, commissionRulesSet);
