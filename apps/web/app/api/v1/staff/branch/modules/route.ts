import { BranchSetModulesRequest } from "@app/contracts/endpoints/branch.setModules";
import { withStaff } from "@app/server/http";
import { branchSetModules } from "@app/server/services/branch/setModules";

export const PATCH = withStaff("branch.setModules", { body: BranchSetModulesRequest }, branchSetModules);
