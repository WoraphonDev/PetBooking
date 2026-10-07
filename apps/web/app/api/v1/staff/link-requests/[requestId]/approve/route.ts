import { LinkRequestsApproveRequest } from "@app/contracts/endpoints/linkRequests.approve";
import { withStaff } from "@app/server/http";
import { linkRequestsApprove } from "@app/server/services/linkRequests/approve";

export const POST = withStaff("linkRequests.approve", { params: LinkRequestsApproveRequest }, linkRequestsApprove);
