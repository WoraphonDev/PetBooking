import {
  CustomersReliabilityOverrideParams,
  CustomersReliabilityOverrideRequest,
} from "@app/contracts/endpoints/customers.reliabilityOverride";
import { withStaff } from "@app/server/http";
import { customersReliabilityOverride } from "@app/server/services/customers/reliabilityOverride";

export const PUT = withStaff(
  "customers.reliabilityOverride",
  { body: CustomersReliabilityOverrideRequest, params: CustomersReliabilityOverrideParams },
  customersReliabilityOverride,
);
