import { ReportCardsSubmitParams } from "@app/contracts/endpoints/reportCards.submit";
import { withStaff } from "@app/server/http";
import { reportCardsSubmit } from "@app/server/services/reportCards/submit";

export const POST = withStaff("reportCards.submit", { params: ReportCardsSubmitParams }, reportCardsSubmit);
