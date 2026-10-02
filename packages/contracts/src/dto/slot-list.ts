import { z } from "zod";
import { IsoInstant, LocalDate, Money, Uuid } from "../common.ts";

/** 05#dto-SlotList — R-04 result for one pet on one day. */
export const SlotList = z.object({
  date: LocalDate,
  reason: z.enum(["ok", "closed", "past", "beyond_horizon", "day_full", "no_capacity"]),
  slots: z.array(
    z.object({
      startsAt: IsoInstant,
      /** R-03: startsAt + durationMinutes */
      endsAt: IsoInstant,
      groomerId: Uuid,
      groomerName: z.string(),
      stationId: Uuid,
    }),
  ),
  /** R-03: Σ duration of the main services + add-ons (R-02) */
  durationMinutes: z.number().int(),
  /** R-02/R-03: Σ price of the main services + add-ons */
  priceSatang: Money,
});
export type SlotList = z.infer<typeof SlotList>;
