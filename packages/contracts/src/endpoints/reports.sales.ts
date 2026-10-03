import { z } from "zod";
import { LocalDate } from "../common.ts";
import { SalesReport } from "../dto/sales-report.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());
const DAY_MS = 86_400_000;

export const ReportsSalesQuery = z
  .object({ from: CalendarDate, to: CalendarDate, groupBy: z.enum(["day", "service", "groomer", "method"]) })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "to must not be before from" })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS < 366, { path: ["to"], message: "at most 366 days" });
export type ReportsSalesQuery = z.infer<typeof ReportsSalesQuery>;
export const ReportsSalesRequest = ReportsSalesQuery;
export type ReportsSalesRequest = ReportsSalesQuery;
export const ReportsSalesResponse = SalesReport;
export type ReportsSalesResponse = z.infer<typeof ReportsSalesResponse>;
