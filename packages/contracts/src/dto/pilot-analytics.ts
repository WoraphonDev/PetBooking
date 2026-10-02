import { z } from "zod";
import { Uuid } from "../common.ts";
import { bookingChannel } from "../enums.ts";

const Count = z.number().int().nonnegative();
const Percent = Count.max(100);
export const PilotAnalytics = z.object({
  orgs: z.array(
    z.object({
      orgId: Uuid,
      activeDays7: Count.max(7),
      bookingsByChannel: z.record(bookingChannel, Count),
      onlineShare: Percent,
      noShowRate: Percent,
      pushUsed: Count,
      reportCardsSent: Count,
      billsClosed: Count,
    }),
  ),
});
export type PilotAnalytics = z.infer<typeof PilotAnalytics>;
