import { AuthResetConfirmRequest } from "@app/contracts/endpoints/auth.resetConfirm";
import { withPublic } from "@app/server/http";
import { authResetConfirm } from "@app/server/services/auth/resetConfirm";

export const POST = withPublic("auth.resetConfirm", { body: AuthResetConfirmRequest }, authResetConfirm);
