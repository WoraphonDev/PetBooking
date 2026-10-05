import { StaffUsersListQuery } from "@app/contracts/endpoints/staffUsers.list";
import { withStaff } from "@app/server/http";
import { staffUsersList } from "@app/server/services/staffUsers/list";

export const GET = withStaff("staffUsers.list", { query: StaffUsersListQuery }, staffUsersList);
