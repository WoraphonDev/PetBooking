import { ReportCardsGetParams } from "@app/contracts/endpoints/reportCards.get";
import { ReportCardsUpdateParams, ReportCardsUpdateRequest } from "@app/contracts/endpoints/reportCards.update";
import { withStaff } from "@app/server/http";
import { reportCardsGet } from "@app/server/services/reportCards/get";
import { reportCardsUpdate } from "@app/server/services/reportCards/update";

export const GET = withStaff("reportCards.get", { params: ReportCardsGetParams }, reportCardsGet);
export const PUT = withStaff("reportCards.update", { body: ReportCardsUpdateRequest, params: ReportCardsUpdateParams }, reportCardsUpdate);
