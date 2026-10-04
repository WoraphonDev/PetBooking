import { BranchSetHoursRequest } from "@app/contracts/endpoints/branch.setHours";
import { withStaff } from "@app/server/http";
import { branchSetHours } from "@app/server/services/branch/setHours";
export const PUT = withStaff("branch.setHours", { body: BranchSetHoursRequest }, branchSetHours);
