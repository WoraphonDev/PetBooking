import { z } from "zod";
import { LocalDate } from "../common.ts";
import { CommissionReport } from "../dto/commission-report.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

export const ReportsCommissionsQuery = z
  .object({ from: CalendarDate, to: CalendarDate })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "to must not be before from" });
export type ReportsCommissionsQuery = z.infer<typeof ReportsCommissionsQuery>;
export const ReportsCommissionsRequest = ReportsCommissionsQuery;
export type ReportsCommissionsRequest = ReportsCommissionsQuery;
export const ReportsCommissionsResponse = CommissionReport;
export type ReportsCommissionsResponse = z.infer<typeof ReportsCommissionsResponse>;
