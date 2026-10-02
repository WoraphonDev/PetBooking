import { z } from "zod";
import { Money, Uuid } from "../common.ts";

/** 05#dto-HotelAvailability — R-28 per room type of the branch. */
export const HotelAvailability = z.object({
  roomTypes: z.array(
    z.object({
      roomTypeId: Uuid,
      nameTh: z.string(),
      /** R-28: units free for every night of the stay */
      availableUnits: z.number().int(),
      /** room_rate of the default plan for the pet's size tier (R-01), else the all-size rate; null = no price set */
      nightlyPriceSatang: Money.nullable(),
      /** R-12 (always true when no petId is sent) */
      eligible: z.boolean(),
      ineligibleReasons: z.array(z.string()),
    }),
  ),
  /** R-03: check_out_date − check_in_date */
  nights: z.number().int(),
});
export type HotelAvailability = z.infer<typeof HotelAvailability>;
