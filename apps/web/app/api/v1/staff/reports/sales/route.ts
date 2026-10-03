import { ReportsSalesQuery } from "@app/contracts/endpoints/reports.sales";
import { withStaff } from "@app/server/http";
import { reportsSales } from "@app/server/services/reports/sales";

export const GET = withStaff("reports.sales", { query: ReportsSalesQuery }, reportsSales);
