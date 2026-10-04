import { ReportCardsListQuery } from "@app/contracts/endpoints/reportCards.list";
import { withStaff } from "@app/server/http";
import { reportCardsList } from "@app/server/services/reportCards/list";

export const GET = withStaff("reportCards.list", { query: ReportCardsListQuery }, reportCardsList);
