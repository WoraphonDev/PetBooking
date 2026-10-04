import { z } from "zod";
import { IsoInstant, LocalDate, Money, Uuid } from "../common.ts";
import { daycareStatus } from "../enums.ts";
import { PetSummary } from "./pet-summary.ts";

/** 05#dto-DaycareVisitItem — one daycare visit. */
export const DaycareVisitItem = z.object({
  id: Uuid,
  bookingId: Uuid,
  pet: PetSummary,
  sessionName: z.string(),
  visitDate: LocalDate,
  priceSatang: Money,
  status: daycareStatus,
  checkedInAt: IsoInstant.nullable(),
  checkedOutAt: IsoInstant.nullable(),
});
export type DaycareVisitItem = z.infer<typeof DaycareVisitItem>;
