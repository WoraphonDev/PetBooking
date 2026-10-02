import { AuthResetRequestRequest } from "@app/contracts/endpoints/auth.resetRequest";
import { withPublic } from "@app/server/http";
import { authResetRequest } from "@app/server/services/auth/resetRequest";

export const POST = withPublic("auth.resetRequest", { body: AuthResetRequestRequest }, authResetRequest);
