import type { LineStatusRequest, LineStatusResponse } from "@app/contracts/endpoints/line.status";
import { lineChannel, notification } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { localMonthKey } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { scopedBranch } from "../availability/hotel.ts";

export async function lineStatus(ctx: RequestContext, _input: LineStatusRequest): Promise<LineStatusResponse> {
  requireRole(ctx, "line.status");
  const db = getDb();
  const b = await scopedBranch(ctx, db);
  const repo = tenantDb(ctx, db);
  const [channel] = (await repo.select(lineChannel, eq(lineChannel.branchId, b.id))) as (typeof lineChannel.$inferSelect)[];
  if (!channel) throw new AppError("NOT_FOUND");
  const rows = (await repo.select(
    notification,
    and(eq(notification.branchId, b.id), eq(notification.monthKey, localMonthKey(ctx.now, b.timezone))),
  )) as (typeof notification.$inferSelect)[];
  return {
    status: channel.status,
    botBasicId: channel.botBasicId,
    addFriendUrl: channel.botBasicId === null ? null : `https://line.me/R/ti/p/${channel.botBasicId}`,
    liffUrl: `https://liff.line.me/${channel.liffId}`,
    monthlyPushQuota: channel.monthlyPushQuota,
    usedThisMonth: rows.filter((r) => r.channel === "line_push" && r.status === "sent").length,
    skippedThisMonth: rows.filter((r) => r.status === "skipped").length,
    webhookVerifiedAt: channel.webhookVerifiedAt?.toISOString() ?? null,
  };
}
