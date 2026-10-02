import { LinkRequestsListRequest } from "@app/contracts/endpoints/linkRequests.list";
import { withStaff } from "@app/server/http";
import { linkRequestsList } from "@app/server/services/linkRequests/list";

export const GET = withStaff("linkRequests.list", { query: LinkRequestsListRequest }, linkRequestsList);
