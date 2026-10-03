import { CustomersTimelineQuery, CustomersTimelineRequest } from "@app/contracts/endpoints/customers.timeline";
import { withStaff } from "@app/server/http";
import { customersTimeline } from "@app/server/services/customers/timeline";

export const GET = withStaff("customers.timeline", { params: CustomersTimelineRequest, query: CustomersTimelineQuery }, customersTimeline);
