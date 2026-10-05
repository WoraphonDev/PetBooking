import { BranchUpdatePolicyRequest } from "@app/contracts/endpoints/branch.updatePolicy";
import { withStaff } from "@app/server/http";
import { branchUpdatePolicy } from "@app/server/services/branch/updatePolicy";

export const PATCH = withStaff("branch.updatePolicy", { body: BranchUpdatePolicyRequest }, branchUpdatePolicy);
