import { AuthStaffLineRequest } from "@app/contracts/endpoints/auth.staffLine";
import { withPublic } from "@app/server/http";
import { authStaffLine } from "@app/server/services/auth/staffLine";

export const POST = withPublic("auth.staffLine", { body: AuthStaffLineRequest }, authStaffLine);
