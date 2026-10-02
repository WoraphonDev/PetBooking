import { z } from "zod";
import { LocalDate } from "../common.ts";
import { CommissionReport } from "../dto/commission-report.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());
const DAY_MS = 86_400_000;

export const StaffMeCommissionsQuery = z
  .object({ from: CalendarDate, to: CalendarDate })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "to must not be before from" })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS + 1 <= 93, { path: ["to"], message: "range must be at most 93 days" });
export type StaffMeCommissionsQuery = z.infer<typeof StaffMeCommissionsQuery>;
export const StaffMeCommissionsRequest = StaffMeCommissionsQuery;
export type StaffMeCommissionsRequest = StaffMeCommissionsQuery;
export const StaffMeCommissionsResponse = CommissionReport;
export type StaffMeCommissionsResponse = z.infer<typeof StaffMeCommissionsResponse>;
