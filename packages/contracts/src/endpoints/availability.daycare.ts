import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { DaycareAvailability } from "../dto/daycare-availability.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

export const AvailabilityDaycareQuery = z.object({ date: CalendarDate, petId: Uuid.optional() });
export type AvailabilityDaycareQuery = z.infer<typeof AvailabilityDaycareQuery>;
export const AvailabilityDaycareRequest = AvailabilityDaycareQuery;
export type AvailabilityDaycareRequest = AvailabilityDaycareQuery;
export const AvailabilityDaycareResponse = DaycareAvailability;
export type AvailabilityDaycareResponse = z.infer<typeof AvailabilityDaycareResponse>;
