import { z } from "zod";
import { Uuid } from "../common.ts";
import { FeedbackItem } from "../dto/feedback-item.ts";
import { feedbackStatus } from "../enums.ts";

export const AdminUpdateFeedbackParams = z.object({ feedbackId: Uuid });
export const AdminUpdateFeedbackRequest = z.object({ status: feedbackStatus });
export type AdminUpdateFeedbackRequest = z.infer<typeof AdminUpdateFeedbackRequest>;
export const AdminUpdateFeedbackResponse = FeedbackItem;
export type AdminUpdateFeedbackResponse = z.infer<typeof AdminUpdateFeedbackResponse>;
