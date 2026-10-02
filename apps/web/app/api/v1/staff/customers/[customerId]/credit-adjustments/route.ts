import { CustomersCreditParams, CustomersCreditRequest } from "@app/contracts/endpoints/customers.credit";
import { withStaff } from "@app/server/http";
import { customersCredit } from "@app/server/services/customers/credit";

export const POST = withStaff("customers.credit", { body: CustomersCreditRequest, params: CustomersCreditParams }, customersCredit);
