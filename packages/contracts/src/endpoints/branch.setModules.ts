import { z } from "zod";
import { Warning } from "../common.ts";
import { BranchSettings } from "../dto/branch-settings.ts";
import { serviceScope } from "../enums.ts";

export const BranchSetModulesRequest = z
  .object({ grooming: z.boolean().optional(), hotel: z.boolean().optional(), daycare: z.boolean().optional() })
  .strict();
export type BranchSetModulesRequest = z.infer<typeof BranchSetModulesRequest>;
/** 05: switching off a module with future bookings is allowed — one warning per module (Q-0115) */
export const BranchSetModulesResponse = BranchSettings.extend({
  warnings: z.array(
    Warning.extend({
      code: z.literal("MODULE_HAS_FUTURE_BOOKINGS"),
      data: z.object({ module: serviceScope, bookingCount: z.number().int() }),
    }),
  ),
});
export type BranchSetModulesResponse = z.infer<typeof BranchSetModulesResponse>;
