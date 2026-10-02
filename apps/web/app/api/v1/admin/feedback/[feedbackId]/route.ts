import { AdminUpdateFeedbackParams, AdminUpdateFeedbackRequest } from "@app/contracts/endpoints/admin.updateFeedback";
import { withAdmin } from "@app/server/http";
import { adminUpdateFeedback } from "@app/server/services/admin/updateFeedback";

export const PATCH = withAdmin(
  "admin.updateFeedback",
  { body: AdminUpdateFeedbackRequest, params: AdminUpdateFeedbackParams },
  adminUpdateFeedback,
);
