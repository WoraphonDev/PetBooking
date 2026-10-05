import { StaffUsersUpdateParams, StaffUsersUpdateRequest } from "@app/contracts/endpoints/staffUsers.update";
import { withStaff } from "@app/server/http";
import { staffUsersUpdate } from "@app/server/services/staffUsers/update";

export const PATCH = withStaff("staffUsers.update", { body: StaffUsersUpdateRequest, params: StaffUsersUpdateParams }, staffUsersUpdate);
