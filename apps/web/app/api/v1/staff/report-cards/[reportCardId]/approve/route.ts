import { ReportCardsApproveParams } from "@app/contracts/endpoints/reportCards.approve";
import { withStaff } from "@app/server/http";
import { reportCardsApprove } from "@app/server/services/reportCards/approve";

export const POST = withStaff("reportCards.approve", { params: ReportCardsApproveParams }, reportCardsApprove);
