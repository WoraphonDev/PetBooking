import { AuthStaffLogoutRequest } from "@app/contracts/endpoints/auth.staffLogout";
import { withStaff } from "@app/server/http";
import { authStaffLogout } from "@app/server/services/auth/staffLogout";

export const POST = withStaff("auth.staffLogout", { body: AuthStaffLogoutRequest }, authStaffLogout);
