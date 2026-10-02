import { DaycareTypesListRequest } from "@app/contracts/endpoints/daycareTypes.list";
import { DaycareTypesUpsertRequest } from "@app/contracts/endpoints/daycareTypes.upsert";
import { withStaff } from "@app/server/http";
import { daycareTypesList } from "@app/server/services/daycareTypes/list";
import { daycareTypesUpsert } from "@app/server/services/daycareTypes/upsert";

export const GET = withStaff("daycareTypes.list", { query: DaycareTypesListRequest }, daycareTypesList);
export const PUT = withStaff("daycareTypes.upsert", { body: DaycareTypesUpsertRequest }, daycareTypesUpsert);
