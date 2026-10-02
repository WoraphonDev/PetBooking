import { z } from "zod";
import { LocalDate, Money } from "../common.ts";
import { groomStatusValues } from "../enums.ts";

const Count = z.number().int().nonnegative();
/** Q-0053: byStatus leaves cancelled appointments out */
const counted = groomStatusValues.filter((s) => s !== "cancelled");

/** 05#dto-DashboardToday — the branch's local day at a glance. */
export const DashboardToday = z.object({
  date: LocalDate,
  groom: z.object({
    total: Count,
    byStatus: z.object(Object.fromEntries(counted.map((s) => [s, Count])) as Record<(typeof counted)[number], typeof Count>),
  }),
  hotel: z.object({ arrivals: Count, departures: Count, inHouse: Count, occupancyPercent: Count.max(100) }),
  daycare: z.object({ count: Count }),
  /** owner only — front_desk does not see sales.* (05#ep-dashboard.today) */
  sales: z.object({ paidTotalSatang: Money, billsClosed: Count }).optional(),
  todo: z.object({
    pendingSlips: Count,
    pendingApprovals: Count,
    overdueCareTasks: Count,
    reportCardsToReview: Count,
    unsentMessages: Count,
    pickupsWithoutBill: Count,
    linkRequests: Count,
  }),
});
export type DashboardToday = z.infer<typeof DashboardToday>;
