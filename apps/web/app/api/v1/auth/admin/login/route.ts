import { AdminLoginRequest } from "@app/contracts/endpoints/admin.login";
import { withPublic } from "@app/server/http";
import { adminLogin } from "@app/server/services/admin/login";

export const POST = withPublic("admin.login", { body: AdminLoginRequest }, adminLogin);
