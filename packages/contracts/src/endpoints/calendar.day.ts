import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { CalendarDay } from "../dto/calendar-day.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

/** 05#ep-calendar.day */
export const CalendarDayQuery = z.strictObject({
  date: CalendarDate,
  /** day (default) | week — week returns 7 CalendarDay starting at `date` */
  view: z.enum(["day", "week"]).optional(),
  groomerId: Uuid.optional(),
});
export type CalendarDayQuery = z.infer<typeof CalendarDayQuery>;
export const CalendarDayRequest = CalendarDayQuery;
export type CalendarDayRequest = CalendarDayQuery;

/** view=day → one CalendarDay; view=week → 7 of them, one per day from `date` */
export const CalendarDayResponse = z.union([CalendarDay, z.array(CalendarDay).length(7)]);
export type CalendarDayResponse = z.infer<typeof CalendarDayResponse>;
