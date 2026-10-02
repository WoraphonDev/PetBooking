import { CustomersPackagesRequest } from "@app/contracts/endpoints/customers.packages";
import { withStaff } from "@app/server/http";
import { customersPackages } from "@app/server/services/customers/packages";

export const GET = withStaff("customers.packages", { params: CustomersPackagesRequest }, customersPackages);
