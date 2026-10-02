import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { HotelAvailability } from "../dto/hotel-availability.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());
const DAY_MS = 86_400_000;

export const AvailabilityHotelQuery = z
  .object({ checkInDate: CalendarDate, checkOutDate: CalendarDate, petId: Uuid.optional() })
  .refine((q) => q.checkOutDate > q.checkInDate, { path: ["checkOutDate"], message: "checkOutDate must be after checkInDate" })
  .refine((q) => (Date.parse(q.checkOutDate) - Date.parse(q.checkInDate)) / DAY_MS <= 30, {
    path: ["checkOutDate"],
    message: "at most 30 nights",
  });
export type AvailabilityHotelQuery = z.infer<typeof AvailabilityHotelQuery>;
export const AvailabilityHotelRequest = AvailabilityHotelQuery;
export type AvailabilityHotelRequest = AvailabilityHotelQuery;
export const AvailabilityHotelResponse = HotelAvailability;
export type AvailabilityHotelResponse = z.infer<typeof AvailabilityHotelResponse>;
