import { z } from "zod";
import { IsoInstant, LocalDate, Uuid } from "../common.ts";
import { serviceScope } from "../enums.ts";

/** 05#dto-AffectedServiceItem — one groom_appointment / stay / daycare_visit hit by a closure or time off (Q-0028). */
export const AffectedServiceItem = z.object({
  module: serviceScope,
  bookingId: Uuid,
  bookingNo: z.string(),
  itemId: Uuid,
  petName: z.string(),
  customerName: z.string(),
  /** groom_appointment.starts_at when module = grooming, else null */
  startsAt: IsoInstant.nullable(),
  /** branch-local date: day of starts_at | stay.check_in_date | daycare_visit.visit_date */
  date: LocalDate,
});
export type AffectedServiceItem = z.infer<typeof AffectedServiceItem>;
