import { BranchSetPromptpayRequest } from "@app/contracts/endpoints/branch.setPromptpay";
import { withStaff } from "@app/server/http";
import { branchSetPromptpay } from "@app/server/services/branch/setPromptpay";

export const PUT = withStaff("branch.setPromptpay", { body: BranchSetPromptpayRequest }, branchSetPromptpay);
