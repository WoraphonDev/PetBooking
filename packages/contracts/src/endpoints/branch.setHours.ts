import { z } from "zod";
import { Warning } from "../common.ts";
import { AffectedServiceItem } from "../dto/affected-service-item.ts";
import { BranchSettings } from "../dto/branch-settings.ts";

const Time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const Hours = z
  .object({
    weekday: z.number().int().min(0).max(6),
    isClosed: z.boolean(),
    opensAt: Time.optional(),
    closesAt: Time.optional(),
  })
  .refine((h) => h.isClosed || (h.opensAt !== undefined && h.closesAt !== undefined && h.closesAt > h.opensAt), {
    message: "Open days require opensAt < closesAt",
  });
export const BranchSetHoursRequest = z.object({
  hours: z
    .array(Hours)
    .length(7)
    .refine((hours) => new Set(hours.map((h) => h.weekday)).size === 7, { message: "Weekdays must be unique" }),
});
export type BranchSetHoursRequest = z.infer<typeof BranchSetHoursRequest>;
// Q-1004: explicitly approved warning shape, with the existing affected-item DTO.
export const BranchSetHoursResponse = BranchSettings.extend({
  warnings: z.array(
    Warning.extend({
      code: z.literal("BRANCH_HOURS_AFFECTED"),
      message: z.literal("มีรายการจองอยู่นอกเวลาเปิดทำการใหม่"),
      data: z.object({ items: z.array(AffectedServiceItem) }),
    }),
  ),
});
export type BranchSetHoursResponse = z.infer<typeof BranchSetHoursResponse>;
