import { SurchargeTypesListRequest } from "@app/contracts/endpoints/surchargeTypes.list";
import { SurchargeTypesUpsertRequest } from "@app/contracts/endpoints/surchargeTypes.upsert";
import { withStaff } from "@app/server/http";
import { surchargeTypesList } from "@app/server/services/surchargeTypes/list";
import { surchargeTypesUpsert } from "@app/server/services/surchargeTypes/upsert";

export const GET = withStaff("surchargeTypes.list", { query: SurchargeTypesListRequest }, surchargeTypesList);
export const PUT = withStaff("surchargeTypes.upsert", { body: SurchargeTypesUpsertRequest }, surchargeTypesUpsert);
