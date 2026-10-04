import { RefundsCreateRequest } from "@app/contracts/endpoints/refunds.create";
import { withStaff } from "@app/server/http";
import { refundsCreate } from "@app/server/services/refunds/create";

export const POST = withStaff("refunds.create", { body: RefundsCreateRequest }, refundsCreate);
