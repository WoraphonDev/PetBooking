import { z } from "zod";
import { LocalDate, LocalTime, Uuid } from "../common.ts";
import { ClosureItem } from "../endpoints/closures.list.ts";
import { TimeOffItem } from "../endpoints/timeOff.list.ts";
import { AppointmentCard } from "./appointment-card.ts";
import { WorkingHours } from "./working-hours.ts";

/** 05#dto-CalendarDay — the grooming calendar of one local day (C-02). */
export const CalendarDay = z.object({
  /** calc: input */
  date: LocalDate,
  /** branch_hours of that weekday; null when the shop is closed that weekday */
  opensAt: LocalTime.nullable(),
  closesAt: LocalTime.nullable(),
  groomers: z.array(
    z.object({
      id: Uuid,
      displayName: z.string(),
      /** staff_working_hours of that weekday; null = not working that day */
      workingHours: WorkingHours.nullable(),
      /** staff_time_off overlapping the day */
      timeOff: z.array(TimeOffItem),
    }),
  ),
  stations: z.array(z.object({ id: Uuid, name: z.string() })),
  /** branch_closure overlapping the day (scope all or grooming) */
  closures: z.array(ClosureItem),
  appointments: z.array(AppointmentCard),
  hotel: z.object({
    arrivals: z.number().int(),
    departures: z.number().int(),
    inHouse: z.number().int(),
  }),
  daycare: z.object({ count: z.number().int() }),
  pendingApprovals: z.number().int(),
  pendingSlips: z.number().int(),
});
export type CalendarDay = z.infer<typeof CalendarDay>;
