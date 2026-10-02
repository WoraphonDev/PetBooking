import { LinkRequestsRejectRequest } from "@app/contracts/endpoints/linkRequests.reject";
import { withStaff } from "@app/server/http";
import { linkRequestsReject } from "@app/server/services/linkRequests/reject";

export const POST = withStaff("linkRequests.reject", { params: LinkRequestsRejectRequest }, linkRequestsReject);
