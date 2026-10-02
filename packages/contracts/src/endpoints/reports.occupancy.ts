import { z } from "zod";
import { LocalDate } from "../common.ts";
import { OccupancyReport } from "../dto/occupancy-report.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());
const DAY_MS = 86_400_000;

export const ReportsOccupancyQuery = z
  .object({ from: CalendarDate, to: CalendarDate })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "to must not be before from" })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS + 1 <= 93, { path: ["to"], message: "range must be at most 93 days" });
export type ReportsOccupancyQuery = z.infer<typeof ReportsOccupancyQuery>;
export const ReportsOccupancyRequest = ReportsOccupancyQuery;
export type ReportsOccupancyRequest = ReportsOccupancyQuery;
export const ReportsOccupancyResponse = OccupancyReport;
export type ReportsOccupancyResponse = z.infer<typeof ReportsOccupancyResponse>;
