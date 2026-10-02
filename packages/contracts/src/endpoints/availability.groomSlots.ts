import { z } from "zod";
import { IsoInstant, LocalDate, Uuid } from "../common.ts";
import { SlotList } from "../dto/slot-list.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

export const AvailabilityGroomSlotsRequest = z.object({
  date: CalendarDate,
  petId: Uuid,
  /** ≥ 1 main (non add-on) grooming service — the service checks main vs add-on */
  serviceIds: z.array(Uuid).min(1),
  addonIds: z.array(Uuid).default([]),
  /** absent = any groomer */
  groomerId: Uuid.optional(),
  /** size override when the pet's weight is unknown */
  sizeTierId: Uuid.optional(),
  /** rescheduling: the appointment being moved does not block itself */
  excludeAppointmentId: Uuid.optional(),
  /** earlier pets of the same booking, not saved yet */
  pendingAppointments: z.array(z.object({ groomerId: Uuid, stationId: Uuid, startsAt: IsoInstant, blockedUntil: IsoInstant })).default([]),
});
export type AvailabilityGroomSlotsRequest = z.infer<typeof AvailabilityGroomSlotsRequest>;
export const AvailabilityGroomSlotsResponse = SlotList;
export type AvailabilityGroomSlotsResponse = z.infer<typeof AvailabilityGroomSlotsResponse>;
