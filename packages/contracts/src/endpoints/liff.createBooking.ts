import { z } from "zod";
import { IsoInstant, LocalDate, LocalTime, Uuid } from "../common.ts";
import { MyBookingDetail } from "../dto/my-booking-detail.ts";

export const LiffCreateBookingParams = z.object({ branchSlug: z.string().min(1) });
export const LiffCreateBookingRequest = z
  .object({
    groom: z
      .array(
        z
          .object({
            petId: Uuid,
            serviceIds: z.array(Uuid).min(1),
            addonIds: z.array(Uuid).default([]),
            /** re-checked against R-04 on the server */
            startsAt: IsoInstant,
            /** absent = any groomer */
            groomerId: Uuid.optional(),
            sizeTierId: Uuid.optional(),
          })
          .strict(),
      )
      .default([]),
    stays: z
      .array(
        z.object({
          petId: Uuid,
          roomTypeId: Uuid,
          checkInDate: LocalDate,
          checkOutDate: LocalDate,
          expectedCheckInTime: LocalTime.optional(),
          expectedCheckOutTime: LocalTime.optional(),
          inHeat: z.boolean(),
          addonServiceIds: z.array(Uuid).default([]),
          /** US-11-06 */
          bathBeforeCheckout: z.object({ serviceIds: z.array(Uuid).min(1), startsAt: IsoInstant }).optional(),
        }),
      )
      .default([]),
    daycare: z.array(z.object({ petId: Uuid, sessionTypeId: Uuid, visitDate: LocalDate })).default([]),
    customerNote: z.string().max(300).optional(),
    /** the customer accepted the cancellation policy */
    acceptedPolicy: z.literal(true),
  })
  .strict()
  .refine((b) => b.groom.length + b.stays.length + b.daycare.length > 0, { path: ["groom"], message: "nothing to book" });
export type LiffCreateBookingRequest = z.infer<typeof LiffCreateBookingRequest>;
export const LiffCreateBookingResponse = MyBookingDetail;
export type LiffCreateBookingResponse = z.infer<typeof LiffCreateBookingResponse>;
