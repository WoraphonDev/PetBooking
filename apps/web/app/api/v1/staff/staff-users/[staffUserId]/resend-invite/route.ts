import { StaffUsersResendInviteRequest } from "@app/contracts/endpoints/staffUsers.resendInvite";
import { withStaff } from "@app/server/http";
import { staffUsersResendInvite } from "@app/server/services/staffUsers/resendInvite";

export const POST = withStaff("staffUsers.resendInvite", { params: StaffUsersResendInviteRequest }, staffUsersResendInvite);
