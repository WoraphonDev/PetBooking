import type { FeedbackItem } from "@app/contracts/dto/feedback-item";
import type { AdminFeedbackRequest, AdminFeedbackResponse } from "@app/contracts/endpoints/admin.feedback";
import { feedbackReport, organization, staffUser } from "@app/db/schema";
import { desc, eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";

/** Every shop's problem reports, newest first (platform-wide: the admin is not tied to one organization). */
export async function adminFeedback(ctx: RequestContext, _input: AdminFeedbackRequest): Promise<AdminFeedbackResponse> {
  if (ctx.actor.type !== "admin") throw new AppError("FORBIDDEN");
  const rows = await getDb()
    .select({ report: feedbackReport, orgName: organization.name, staffName: staffUser.displayName })
    .from(feedbackReport)
    .innerJoin(organization, eq(organization.id, feedbackReport.organizationId))
    .innerJoin(staffUser, eq(staffUser.id, feedbackReport.staffUserId))
    .orderBy(desc(feedbackReport.createdAt), desc(feedbackReport.id));
  return rows.map(
    ({ report: r, orgName, staffName }): FeedbackItem => ({
      id: r.id,
      orgName,
      staffName,
      pageUrl: r.pageUrl,
      message: r.message,
      // signed URL needs object storage (T-0038) — null until then (Q-0032)
      screenshotUrl: null,
      appVersion: r.appVersion,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }),
  );
}
