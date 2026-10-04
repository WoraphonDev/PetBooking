import { z } from "zod";
import { IsoInstant, Money, Uuid } from "../common.ts";
import { depositStatus, groomerPreference, groomStatus } from "../enums.ts";
import { PetSummary } from "./pet-summary.ts";

/** 05#dto-AppointmentCard — one grooming appointment (calendar / booking detail). */
export const AppointmentCard = z.object({
  id: Uuid,
  bookingId: Uuid,
  bookingNo: z.string(),
  status: groomStatus,
  startsAt: IsoInstant,
  endsAt: IsoInstant,
  blockedUntil: IsoInstant,
  groomerId: Uuid,
  groomerName: z.string(),
  groomerPreference,
  stationId: Uuid,
  stationName: z.string(),
  pet: PetSummary,
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  items: z.array(
    z.object({
      serviceId: Uuid,
      name: z.string(),
      isAddon: z.boolean(),
      priceSatang: Money,
      durationMinutes: z.number().int(),
      customerPackageId: Uuid.nullable(),
    }),
  ),
  surcharges: z.array(z.object({ id: Uuid, name: z.string(), amountSatang: Money, reason: z.string() })),
  servicesTotalSatang: Money,
  surchargeTotalSatang: Money,
  depositStatus,
  /** customer.reliability_level */
  reliabilityLevel: z.number().int().min(1).max(4),
  fromStayId: Uuid.nullable(),
  checkedInAt: IsoInstant.nullable(),
  startedAt: IsoInstant.nullable(),
  doneAt: IsoInstant.nullable(),
  pickedUpAt: IsoInstant.nullable(),
  staffNote: z.string().nullable(),
});
export type AppointmentCard = z.infer<typeof AppointmentCard>;
