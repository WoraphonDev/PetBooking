import { z } from "zod";
import { LocalDate } from "../common.ts";
import { PilotAnalytics } from "../dto/pilot-analytics.ts";

export const AdminAnalyticsRequest = z.strictObject({});
export type AdminAnalyticsRequest = z.infer<typeof AdminAnalyticsRequest>;
export const AdminAnalyticsQuery = z
  .strictObject({ from: LocalDate.pipe(z.iso.date()), to: LocalDate.pipe(z.iso.date()) })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "to must be on or after from" });
export type AdminAnalyticsQuery = z.infer<typeof AdminAnalyticsQuery>;
export const AdminAnalyticsResponse = PilotAnalytics;
export type AdminAnalyticsResponse = z.infer<typeof AdminAnalyticsResponse>;
