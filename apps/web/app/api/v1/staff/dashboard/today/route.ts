import { DashboardTodayRequest } from "@app/contracts/endpoints/dashboard.today";
import { withStaff } from "@app/server/http";
import { dashboardToday } from "@app/server/services/dashboard/today";

export const GET = withStaff("dashboard.today", { query: DashboardTodayRequest }, dashboardToday);
