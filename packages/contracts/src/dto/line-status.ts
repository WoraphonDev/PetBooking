import { z } from "zod";
import { IsoInstant } from "../common.ts";
import { lineChannelStatus } from "../enums.ts";

export const LineStatus = z.object({
  status: lineChannelStatus,
  botBasicId: z.string().nullable(),
  addFriendUrl: z.string().url().nullable(),
  liffUrl: z.string().url(),
  monthlyPushQuota: z.number().int(),
  usedThisMonth: z.number().int().nonnegative(),
  skippedThisMonth: z.number().int().nonnegative(),
  webhookVerifiedAt: IsoInstant.nullable(),
});
export type LineStatus = z.infer<typeof LineStatus>;
