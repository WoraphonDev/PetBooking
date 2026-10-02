import { z } from "zod";

/** no body — authorised by the `x-cron-secret` header (= env CRON_SECRET) */
export const CronTickRequest = z.object({});
export type CronTickRequest = z.infer<typeof CronTickRequest>;
export const CronTickResponse = z.object({ processed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() });
export type CronTickResponse = z.infer<typeof CronTickResponse>;
