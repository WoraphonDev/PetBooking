import { FeedbackCreateRequest } from "@app/contracts/endpoints/feedback.create";
import { withStaff } from "@app/server/http";
import { feedbackCreate } from "@app/server/services/feedback/create";

export const POST = withStaff("feedback.create", { body: FeedbackCreateRequest }, feedbackCreate);
