import { z } from "zod";
import { LocalDate } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

export const GroomMyQueueQuery = z.object({
  /** branch-local day; default today */
  date: CalendarDate.optional(),
});
export type GroomMyQueueQuery = z.infer<typeof GroomMyQueueQuery>;
export const GroomMyQueueRequest = GroomMyQueueQuery;
export type GroomMyQueueRequest = GroomMyQueueQuery;
export const GroomMyQueueResponse = z.array(AppointmentCard);
export type GroomMyQueueResponse = z.infer<typeof GroomMyQueueResponse>;
