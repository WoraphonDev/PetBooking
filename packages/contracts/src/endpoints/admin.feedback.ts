import { z } from "zod";
import { FeedbackItem } from "../dto/feedback-item.ts";

/** no query parameters */
export const AdminFeedbackRequest = z.strictObject({});
export type AdminFeedbackRequest = z.infer<typeof AdminFeedbackRequest>;
export const AdminFeedbackResponse = z.array(FeedbackItem);
export type AdminFeedbackResponse = z.infer<typeof AdminFeedbackResponse>;
