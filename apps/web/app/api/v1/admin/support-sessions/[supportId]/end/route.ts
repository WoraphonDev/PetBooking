import { AdminSupportEndRequest } from "@app/contracts/endpoints/admin.supportEnd";
import { withAdmin } from "@app/server/http";
import { adminSupportEnd } from "@app/server/services/admin/supportEnd";

export const POST = withAdmin("admin.supportEnd", { params: AdminSupportEndRequest }, adminSupportEnd);
