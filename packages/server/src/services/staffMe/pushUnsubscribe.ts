import type { StaffMePushUnsubscribeRequest, StaffMePushUnsubscribeResponse } from "@app/contracts/endpoints/staffMe.pushUnsubscribe";
import { webPushSubscription } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";

/** 05#ep-staffMe.pushUnsubscribe: delete the caller's subscription for this endpoint; not the caller's (or unknown) → NOT_FOUND. */
export async function staffMePushUnsubscribe(
  ctx: RequestContext,
  input: StaffMePushUnsubscribeRequest,
): Promise<StaffMePushUnsubscribeResponse> {
  requireRole(ctx, "staffMe.pushUnsubscribe");
  if (ctx.actor.type !== "staff" || !ctx.actor.id || !ctx.orgId) throw new AppError("FORBIDDEN");
  const me = ctx.actor.id;
  const orgId = ctx.orgId;
  await withTx(ctx, async (tx) => {
    const removed = await tx
      .delete(webPushSubscription)
      .where(
        and(
          eq(webPushSubscription.organizationId, orgId),
          eq(webPushSubscription.staffUserId, me),
          eq(webPushSubscription.endpoint, input.endpoint),
        ),
      )
      .returning({ id: webPushSubscription.id });
    if (!removed.length) throw new AppError("NOT_FOUND");
  });
  return undefined;
}
