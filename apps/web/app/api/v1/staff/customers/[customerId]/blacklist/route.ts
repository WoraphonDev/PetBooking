import { CustomersBlacklistParams, CustomersBlacklistRequest } from "@app/contracts/endpoints/customers.blacklist";
import { withStaff } from "@app/server/http";
import { customersBlacklist } from "@app/server/services/customers/blacklist";

export const POST = withStaff(
  "customers.blacklist",
  { body: CustomersBlacklistRequest, params: CustomersBlacklistParams },
  customersBlacklist,
);
