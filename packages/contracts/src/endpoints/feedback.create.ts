import { z } from "zod";
import { Uuid } from "../common.ts";

export const FeedbackCreateRequest = z.object({
  pageUrl: z.string().trim().min(1).max(2000),
  message: z.string().trim().min(5).max(2000),
  /** a `feedback` file (kind checked when committed) */
  screenshotFileId: Uuid.optional(),
  appVersion: z.string().trim().max(100).optional(),
});
export type FeedbackCreateRequest = z.infer<typeof FeedbackCreateRequest>;
/** 204 No Content */
export const FeedbackCreateResponse = z.undefined();
export type FeedbackCreateResponse = z.infer<typeof FeedbackCreateResponse>;
