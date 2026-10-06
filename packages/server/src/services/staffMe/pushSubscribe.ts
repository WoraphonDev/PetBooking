import type { StaffMePushSubscribeRequest, StaffMePushSubscribeResponse } from "@app/contracts/endpoints/staffMe.pushSubscribe";
import { webPushSubscription } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/**
 * 05#ep-staffMe.pushSubscribe: upsert by endpoint for the caller (keys refreshed, disabled_at cleared). An endpoint already
 * registered in another organization → NOT_FOUND (tenant rows are never moved across shops, Q-1041).
 */
export async function staffMePushSubscribe(ctx: RequestContext, input: StaffMePushSubscribeRequest): Promise<StaffMePushSubscribeResponse> {
  requireRole(ctx, "staffMe.pushSubscribe");
  if (ctx.actor.type !== "staff" || !ctx.actor.id || !ctx.orgId) throw new AppError("FORBIDDEN");
  const me = ctx.actor.id;
  const orgId = ctx.orgId;
  await withTx(ctx, async (tx) => {
    // endpoint is unique across organizations: read it without the tenant key to tell "mine" from "another shop's"
    const [existing] = await tx.select().from(webPushSubscription).where(eq(webPushSubscription.endpoint, input.endpoint)).for("update");
    const values = {
      staffUserId: me,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: ctx.userAgent,
      disabledAt: null,
      updatedAt: ctx.now,
    };
    if (!existing) {
      await tenantDb(ctx, tx).insert(webPushSubscription, { ...values, endpoint: input.endpoint, createdAt: ctx.now });
      return;
    }
    if (existing.organizationId !== orgId) throw new AppError("NOT_FOUND");
    await tenantDb(ctx, tx).update(webPushSubscription, values, eq(webPushSubscription.id, existing.id));
  });
  return undefined;
}
