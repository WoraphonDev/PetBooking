import { AdminResolveDataRequestParams, AdminResolveDataRequestRequest } from "@app/contracts/endpoints/admin.resolveDataRequest";
import { withAdmin } from "@app/server/http";
import { adminResolveDataRequest } from "@app/server/services/admin/resolveDataRequest";

export const POST = withAdmin(
  "admin.resolveDataRequest",
  { body: AdminResolveDataRequestRequest, params: AdminResolveDataRequestParams },
  adminResolveDataRequest,
);
