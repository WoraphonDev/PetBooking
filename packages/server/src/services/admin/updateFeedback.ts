import type { AdminUpdateFeedbackRequest, AdminUpdateFeedbackResponse } from "@app/contracts/endpoints/admin.updateFeedback";
import { feedbackReport, organization, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";

/** Sets a report's status (feedback_report has no state machine in 03: any status may follow any other). */
export async function adminUpdateFeedback(
  ctx: RequestContext,
  input: AdminUpdateFeedbackRequest & { feedbackId: string },
): Promise<AdminUpdateFeedbackResponse> {
  if (ctx.actor.type !== "admin") throw new AppError("FORBIDDEN");
  return withTx(ctx, async (tx) => {
    // platform-wide: the admin is not tied to one organization
    const [updated] = await tx
      .update(feedbackReport)
      .set({ status: input.status, updatedAt: ctx.now })
      .where(eq(feedbackReport.id, input.feedbackId))
      .returning();
    if (!updated) throw new AppError("NOT_FOUND");
    const [names] = await tx
      .select({ orgName: organization.name, staffName: staffUser.displayName })
      .from(organization)
      .innerJoin(staffUser, eq(staffUser.id, updated.staffUserId))
      .where(eq(organization.id, updated.organizationId));
    return {
      id: updated.id,
      orgName: names?.orgName ?? "",
      staffName: names?.staffName ?? "",
      pageUrl: updated.pageUrl,
      message: updated.message,
      // signed URL needs object storage (T-0038) — null until then (Q-0032)
      screenshotUrl: null,
      appVersion: updated.appVersion,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  });
}
