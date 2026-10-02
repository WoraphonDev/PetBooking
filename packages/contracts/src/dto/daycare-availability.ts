import { z } from "zod";
import { LocalDate, Money, Uuid } from "../common.ts";
import { daycareSession } from "../enums.ts";

/** 05#dto-DaycareAvailability — R-29 for one day (active session types only). */
export const DaycareAvailability = z.object({
  date: LocalDate,
  sessions: z.array(
    z.object({
      sessionTypeId: Uuid,
      session: daycareSession,
      nameTh: z.string(),
      /** R-29 free places */
      available: z.number().int(),
      /** daycare_rate of the default plan for the pet's size tier (R-01), else the all-size rate; null = no price set */
      priceSatang: Money.nullable(),
    }),
  ),
});
export type DaycareAvailability = z.infer<typeof DaycareAvailability>;
