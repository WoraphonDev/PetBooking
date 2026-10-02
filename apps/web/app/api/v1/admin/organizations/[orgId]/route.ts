import { AdminUpdateOrgParams, AdminUpdateOrgRequest } from "@app/contracts/endpoints/admin.updateOrg";
import { withAdmin } from "@app/server/http";
import { adminUpdateOrg } from "@app/server/services/admin/updateOrg";

export const PATCH = withAdmin("admin.updateOrg", { body: AdminUpdateOrgRequest, params: AdminUpdateOrgParams }, adminUpdateOrg);
