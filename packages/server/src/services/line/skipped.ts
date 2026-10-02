import type { LineSkippedQuery, LineSkippedResponse } from "@app/contracts/endpoints/line.skipped";
import { customer, notification, ownerProfile } from "@app/db/schema";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import type { NotificationPayloads, TemplateKey } from "../../notify/keys.ts";
import { renderTemplate } from "../../notify/templates/index.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { scopedBranch } from "../availability/hotel.ts";

export async function lineSkipped(ctx: RequestContext, input: LineSkippedQuery): Promise<LineSkippedResponse> {
  requireRole(ctx, "line.skipped");
  const db = getDb();
  const b = await scopedBranch(ctx, db);
  const repo = tenantDb(ctx, db);
  const rows = (await repo
    .select(
      notification,
      and(
        eq(notification.branchId, b.id),
        eq(notification.status, "skipped"),
        gte(notification.createdAt, new Date(ctx.now.getTime() - input.days * 86_400_000)),
        lte(notification.createdAt, ctx.now),
      ),
    )
    .orderBy(desc(notification.createdAt))) as (typeof notification.$inferSelect)[];
  const ids = rows.filter((r) => r.recipientType === "customer").map((r) => r.recipientId);
  const customers = ids.length ? ((await repo.select(customer, inArray(customer.id, ids))) as (typeof customer.$inferSelect)[]) : [];
  const ownerIds = customers.map((c) => c.ownerProfileId);
  // Shared owner profiles are reached only through this tenant's customers.
  const owners = ownerIds.length ? await db.select().from(ownerProfile).where(inArray(ownerProfile.id, ownerIds)) : [];
  const names = new Map(customers.map((c) => [c.id, owners.find((o) => o.id === c.ownerProfileId)?.firstName ?? null]));
  return rows.map((r) => ({
    id: r.id,
    templateKey: r.templateKey,
    recipientName: r.recipientType === "customer" ? (names.get(r.recipientId) ?? null) : null,
    skipReason: r.skipReason,
    text: renderTemplate(r.templateKey as TemplateKey, r.payload as NotificationPayloads[TemplateKey]).text,
    createdAt: r.createdAt.toISOString(),
  }));
}
