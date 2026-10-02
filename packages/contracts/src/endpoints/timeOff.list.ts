import { z } from "zod";
import { IsoInstant, LocalDate, Uuid } from "../common.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

export const TimeOffListQuery = z
  .object({ from: CalendarDate, to: CalendarDate })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "to must not be before from" });
export type TimeOffListQuery = z.infer<typeof TimeOffListQuery>;
export const TimeOffListRequest = TimeOffListQuery;
export type TimeOffListRequest = TimeOffListQuery;

/** staff_time_off.* */
export const TimeOffItem = z.object({
  id: Uuid,
  organizationId: Uuid,
  staffUserId: Uuid,
  startsAt: IsoInstant,
  endsAt: IsoInstant,
  reason: z.string().nullable(),
  createdBy: Uuid.nullable(),
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
});
export type TimeOffItem = z.infer<typeof TimeOffItem>;
export const TimeOffListResponse = z.array(TimeOffItem);
export type TimeOffListResponse = z.infer<typeof TimeOffListResponse>;
