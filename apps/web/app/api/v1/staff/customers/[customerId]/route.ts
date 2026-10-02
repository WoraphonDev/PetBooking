import { CustomersGetRequest } from "@app/contracts/endpoints/customers.get";
import { withStaff } from "@app/server/http";
import { customersGet } from "@app/server/services/customers/get";

export const GET = withStaff("customers.get", { params: CustomersGetRequest }, customersGet);
