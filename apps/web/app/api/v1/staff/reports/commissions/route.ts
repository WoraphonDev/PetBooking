import { ReportsCommissionsQuery } from "@app/contracts/endpoints/reports.commissions";
import { withStaff } from "@app/server/http";
import { reportsCommissions } from "@app/server/services/reports/commissions";

export const GET = withStaff("reports.commissions", { query: ReportsCommissionsQuery }, reportsCommissions);
