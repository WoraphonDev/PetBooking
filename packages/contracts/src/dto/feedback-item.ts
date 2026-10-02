import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { feedbackStatus } from "../enums.ts";

/** 05#dto-FeedbackItem — a problem report sent from a shop. */
export const FeedbackItem = z.object({
  id: Uuid,
  orgName: z.string(),
  staffName: z.string(),
  pageUrl: z.string(),
  message: z.string(),
  /** signed URL of feedback_report.screenshot_file_id — null until object storage (T-0038) is wired in (Q-0032) */
  screenshotUrl: z.string().nullable(),
  appVersion: z.string().nullable(),
  status: feedbackStatus,
  createdAt: IsoInstant,
});
export type FeedbackItem = z.infer<typeof FeedbackItem>;
