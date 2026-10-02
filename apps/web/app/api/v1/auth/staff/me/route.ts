import { AuthMeRequest } from "@app/contracts/endpoints/auth.me";
import { withStaff } from "@app/server/http";
import { authMe } from "@app/server/services/auth/me";

export const GET = withStaff("auth.me", { query: AuthMeRequest }, authMe);
