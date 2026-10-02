import { SizeTiersListRequest } from "@app/contracts/endpoints/sizeTiers.list";
import { withStaff } from "@app/server/http";
import { sizeTiersList } from "@app/server/services/sizeTiers/list";

export const GET = withStaff("sizeTiers.list", { query: SizeTiersListRequest }, sizeTiersList);
