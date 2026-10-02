import { ReportsOccupancyRequest } from "@app/contracts/endpoints/reports.occupancy";
import { withStaff } from "@app/server/http";
import { reportsOccupancy } from "@app/server/services/reports/occupancy";

export const GET = withStaff("reports.occupancy", { query: ReportsOccupancyRequest }, reportsOccupancy);
