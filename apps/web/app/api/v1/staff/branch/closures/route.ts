import { ClosuresCreateRequest } from "@app/contracts/endpoints/closures.create";
import { ClosuresListQuery } from "@app/contracts/endpoints/closures.list";
import { withStaff } from "@app/server/http";
import { closuresCreate } from "@app/server/services/closures/create";
import { closuresList } from "@app/server/services/closures/list";

export const GET = withStaff("closures.list", { query: ClosuresListQuery }, closuresList);
export const POST = withStaff("closures.create", { body: ClosuresCreateRequest }, closuresCreate);
