import { z } from "zod";
import { LocalTime } from "../common.ts";

/** 05#dto-WorkingHours — one weekday of a staff member's working time (local). */
export const WorkingHours = z.object({
  weekday: z.number().int().min(0).max(6),
  startsAt: LocalTime,
  endsAt: LocalTime,
  breakStartsAt: LocalTime.nullable(),
  breakEndsAt: LocalTime.nullable(),
});
export type WorkingHours = z.infer<typeof WorkingHours>;
