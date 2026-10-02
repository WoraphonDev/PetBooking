import { SizeTiersListRequest } from "@app/contracts/endpoints/sizeTiers.list";
import { SizeTiersSetRequest } from "@app/contracts/endpoints/sizeTiers.set";
import { withStaff } from "@app/server/http";
import { sizeTiersList } from "@app/server/services/sizeTiers/list";
import { sizeTiersSet } from "@app/server/services/sizeTiers/set";

export const GET = withStaff("sizeTiers.list", { query: SizeTiersListRequest }, sizeTiersList);
export const PUT = withStaff("sizeTiers.set", { body: SizeTiersSetRequest }, sizeTiersSet);
