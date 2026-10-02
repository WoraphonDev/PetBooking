import { AdminSupportStartRequest } from "@app/contracts/endpoints/admin.supportStart";
import { withAdmin } from "@app/server/http";
import { adminSupportStart } from "@app/server/services/admin/supportStart";

export const POST = withAdmin("admin.supportStart", { body: AdminSupportStartRequest }, adminSupportStart);
