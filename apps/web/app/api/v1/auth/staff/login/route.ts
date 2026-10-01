import { AuthStaffLoginRequest } from "@app/contracts/endpoints/auth.staffLogin";
import { withPublic } from "@app/server/http";
import { authStaffLogin } from "@app/server/services/auth/staffLogin";

export const POST = withPublic("auth.staffLogin", { body: AuthStaffLoginRequest }, authStaffLogin);
