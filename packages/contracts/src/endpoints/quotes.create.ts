import { z } from "zod";
import { IsoInstant, LocalDate, LocalTime, Uuid } from "../common.ts";
import { Quote } from "../dto/quote.ts";
import { groomerPreference } from "../enums.ts";

export const QuotesCreateRequest = z.object({
  customerId: Uuid,
  groom: z
    .array(
      z.object({
        petId: Uuid,
        serviceIds: z.array(Uuid).min(1),
        addonIds: z.array(Uuid).default([]),
        startsAt: IsoInstant,
        groomerId: Uuid,
        stationId: Uuid,
        groomerPreference,
        sizeTierId: Uuid.optional(),
        customerPackageId: Uuid.optional(),
      }),
    )
    .default([]),
  // same item shapes as bookings.create (05#ep-bookings.create)
  stays: z
    .array(
      z.object({
        petId: Uuid,
        roomTypeId: Uuid,
        roomUnitId: Uuid.optional(),
        checkInDate: LocalDate,
        checkOutDate: LocalDate,
        expectedCheckInTime: LocalTime.optional(),
        expectedCheckOutTime: LocalTime.optional(),
        inHeat: z.boolean().optional(),
        addonServiceIds: z.array(Uuid).default([]),
        bundleGroom: z
          .object({
            serviceIds: z.array(Uuid).min(1),
            addonIds: z.array(Uuid).default([]),
            startsAt: IsoInstant,
            groomerId: Uuid,
            stationId: Uuid,
          })
          .optional(),
      }),
    )
    .default([]),
  daycare: z.array(z.object({ petId: Uuid, sessionTypeId: Uuid, visitDate: LocalDate })).default([]),
});
export type QuotesCreateRequest = z.infer<typeof QuotesCreateRequest>;
export const QuotesCreateResponse = Quote;
export type QuotesCreateResponse = z.infer<typeof QuotesCreateResponse>;
