import { WorkingHoursSetParams, WorkingHoursSetRequest } from "@app/contracts/endpoints/workingHours.set";
import { withStaff } from "@app/server/http";
import { workingHoursSet } from "@app/server/services/workingHours/set";

export const PUT = withStaff("workingHours.set", { body: WorkingHoursSetRequest, params: WorkingHoursSetParams }, workingHoursSet);
