import { z } from "zod";
import { Uuid, Warning } from "../common.ts";
import { StaffUserItem } from "../dto/staff-user-item.ts";

const Time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const Day = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startsAt: Time,
    endsAt: Time,
    breakStartsAt: Time.optional(),
    breakEndsAt: Time.optional(),
  })
  .strict()
  .refine((d) => d.endsAt > d.startsAt, { path: ["endsAt"], message: "endsAt must be after startsAt" })
  // a break is a pair inside the working time (Q-1011)
  .refine((d) => (d.breakStartsAt === undefined) === (d.breakEndsAt === undefined), {
    path: ["breakEndsAt"],
    message: "break needs both ends",
  })
  .refine(
    (d) =>
      d.breakStartsAt === undefined ||
      d.breakEndsAt === undefined ||
      (d.breakStartsAt >= d.startsAt && d.breakEndsAt > d.breakStartsAt && d.breakEndsAt <= d.endsAt),
    { path: ["breakStartsAt"], message: "break must lie inside the working time" },
  );

export const WorkingHoursSetParams = z.object({ staffUserId: Uuid });
/** 05#ep-workingHours.set — the whole week; a weekday left out = day off */
export const WorkingHoursSetRequest = z
  .object({
    days: z
      .array(Day)
      .max(7)
      .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, { message: "Weekdays must be unique" }),
  })
  .strict();
export type WorkingHoursSetRequest = z.infer<typeof WorkingHoursSetRequest>;
/** future appointments now outside the groomer's hours stay — warning WORKING_HOURS_AFFECTED (Q-1011) */
export const WorkingHoursSetResponse = StaffUserItem.extend({ warnings: z.array(Warning).optional() });
export type WorkingHoursSetResponse = z.infer<typeof WorkingHoursSetResponse>;
