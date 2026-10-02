import { AdminDataRequestsRequest } from "@app/contracts/endpoints/admin.dataRequests";
import { withAdmin } from "@app/server/http";
import { adminDataRequests } from "@app/server/services/admin/dataRequests";

export const GET = withAdmin("admin.dataRequests", { query: AdminDataRequestsRequest }, adminDataRequests);
