import { AdminFeedbackRequest } from "@app/contracts/endpoints/admin.feedback";
import { withAdmin } from "@app/server/http";
import { adminFeedback } from "@app/server/services/admin/feedback";

export const GET = withAdmin("admin.feedback", { query: AdminFeedbackRequest }, adminFeedback);
