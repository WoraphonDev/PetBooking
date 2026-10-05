import type { FeedbackCreateRequest, FeedbackCreateResponse } from "@app/contracts/endpoints/feedback.create";
import { feedbackReport, organization, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

/**
 * 05#ep-feedback.create: a feedback_report from the signed-in staff member (optional `feedback` screenshot, committed) and
 * admin.feedback {shopName = organization name, message} to every active platform admin (07 §1.1, dedupe feedback:{id}).
 */
export async function feedbackCreate(ctx: RequestContext, input: FeedbackCreateRequest): Promise<FeedbackCreateResponse> {
  requireRole(ctx, "feedback.create");
  if (!ctx.orgId || ctx.actor.type !== "staff" || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const staffUserId = ctx.actor.id;
  await withTx(ctx, async (tx) => {
    if (input.screenshotFileId) await commitFile(tx, ctx, input.screenshotFileId, "feedback");
    const [report] = (await tenantDb(ctx, tx).insert(feedbackReport, {
      staffUserId,
      pageUrl: input.pageUrl,
      message: input.message,
      screenshotFileId: input.screenshotFileId ?? null,
      appVersion: input.appVersion || null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof feedbackReport.$inferSelect)[];
    if (!report) throw new Error("feedback.create: no inserted row");
    // organization / platform_admin are platform tables (no tenant key); the org is the session's own
    const [org] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ctx.orgId as string));
    const admins = await tx.select({ id: platformAdmin.id }).from(platformAdmin).where(eq(platformAdmin.status, "active"));
    for (const admin of admins)
      await enqueueNotification(tx, ctx, {
        key: "admin.feedback",
        recipient: { type: "platform_admin", id: admin.id },
        payload: { shopName: org?.name ?? "", message: input.message },
        dedupeKey: `feedback:${report.id}`,
      });
  });
  return undefined;
}
