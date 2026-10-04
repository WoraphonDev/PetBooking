import { BranchGetRequest } from "@app/contracts/endpoints/branch.get";
import { BranchUpdateRequest } from "@app/contracts/endpoints/branch.update";
import { withStaff } from "@app/server/http";
import { branchGet } from "@app/server/services/branch/get";
import { branchUpdate } from "@app/server/services/branch/update";
export const GET = withStaff("branch.get", { query: BranchGetRequest }, branchGet);
export const PATCH = withStaff("branch.update", { body: BranchUpdateRequest }, branchUpdate);
