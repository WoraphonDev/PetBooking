import { z } from "zod";
import { LocalDate } from "../common.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

export const EXPORT_TYPES = ["customers", "pets", "bills", "bill_lines", "commissions", "bookings"] as const;
export const ExportsCsvParams = z.object({ type: z.enum(EXPORT_TYPES) });
export const ExportsCsvQuery = z
  .object({ from: CalendarDate.optional(), to: CalendarDate.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "to must not be before from" });
export type ExportsCsvQuery = z.infer<typeof ExportsCsvQuery>;
export const ExportsCsvRequest = ExportsCsvQuery.and(ExportsCsvParams);
export type ExportsCsvRequest = z.infer<typeof ExportsCsvRequest>;
/** text/csv body: UTF-8 BOM, snake_case English header, money in baht with 2 decimals */
export const ExportsCsvResponse = z.string();
export type ExportsCsvResponse = z.infer<typeof ExportsCsvResponse>;
