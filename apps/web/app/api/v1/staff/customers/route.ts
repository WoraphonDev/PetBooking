import { CustomersCreateRequest } from "@app/contracts/endpoints/customers.create";
import { CustomersListRequest } from "@app/contracts/endpoints/customers.list";
import { withStaff } from "@app/server/http";
import { customersCreate } from "@app/server/services/customers/create";
import { customersList } from "@app/server/services/customers/list";

export const GET = withStaff("customers.list", { query: CustomersListRequest }, customersList);
export const POST = withStaff("customers.create", { body: CustomersCreateRequest }, customersCreate);
