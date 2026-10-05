import { StaffUsersInviteRequest } from "@app/contracts/endpoints/staffUsers.invite";
import { withStaff } from "@app/server/http";
import { staffUsersInvite } from "@app/server/services/staffUsers/invite";

export const POST = withStaff("staffUsers.invite", { body: StaffUsersInviteRequest }, staffUsersInvite);
