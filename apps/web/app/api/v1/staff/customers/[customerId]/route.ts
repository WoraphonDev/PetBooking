import { CustomersGetRequest } from "@app/contracts/endpoints/customers.get";
import { CustomersUpdateParams, CustomersUpdateRequest } from "@app/contracts/endpoints/customers.update";
import { withStaff } from "@app/server/http";
import { customersGet } from "@app/server/services/customers/get";
import { customersUpdate } from "@app/server/services/customers/update";

export const GET = withStaff("customers.get", { params: CustomersGetRequest }, customersGet);
export const PATCH = withStaff("customers.update", { body: CustomersUpdateRequest, params: CustomersUpdateParams }, customersUpdate);
