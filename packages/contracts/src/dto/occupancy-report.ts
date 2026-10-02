import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";

/** whole percent: round(occupied × 100 / total), 0 when total = 0 (Q-0031) */
const Percent = z.number().int().min(0);

/** 05#dto-OccupancyReport — hotel occupancy of the branch per local night from..to (Q-0031). */
export const OccupancyReport = z.object({
  from: LocalDate,
  to: LocalDate,
  days: z.array(
    z.object({
      /** the night of this local date (check_in_date ≤ date < check_out_date) */
      date: LocalDate,
      /** distinct room units with a checked_in/checked_out stay covering the night */
      occupiedUnits: z.number().int(),
      /** room_unit status active */
      totalUnits: z.number().int(),
      percent: Percent,
    }),
  ),
  byRoomType: z.array(
    z.object({
      roomTypeId: Uuid,
      roomTypeName: z.string(),
      /** Σ over the days of occupied units of this type */
      occupiedNights: z.number().int(),
      /** active units of this type × number of days */
      totalNights: z.number().int(),
      percent: Percent,
    }),
  ),
});
export type OccupancyReport = z.infer<typeof OccupancyReport>;
