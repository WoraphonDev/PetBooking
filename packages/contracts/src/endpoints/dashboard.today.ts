import { z } from "zod";
import { DashboardToday } from "../dto/dashboard-today.ts";

/** no query parameters */
export const DashboardTodayRequest = z.strictObject({});
export type DashboardTodayRequest = z.infer<typeof DashboardTodayRequest>;
export const DashboardTodayResponse = DashboardToday;
export type DashboardTodayResponse = z.infer<typeof DashboardTodayResponse>;
