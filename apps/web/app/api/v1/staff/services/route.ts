import { ServicesCreateRequest } from "@app/contracts/endpoints/services.create";
import { ServicesListQuery } from "@app/contracts/endpoints/services.list";
import { withStaff } from "@app/server/http";
import { servicesCreate } from "@app/server/services/services/create";
import { servicesList } from "@app/server/services/services/list";
export const GET = withStaff("services.list", { query: ServicesListQuery }, servicesList);
export const POST = withStaff("services.create", { body: ServicesCreateRequest }, servicesCreate);
