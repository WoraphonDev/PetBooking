import type { AuditListRequest, AuditListResponse } from "@app/contracts/endpoints/audit.list";
import { auditLog, platformAdmin, staffUser } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, desc, eq, gte, inArray, lt, or, type SQL } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** opaque cursor = base64url("<created_at ISO>|<id>") of the last row of the previous page (newest first) */
function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}
function decodeCursor(cursor: string): { at: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const at = new Date(iso ?? "");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(at.getTime()))
    throw new AppError("VALIDATION_FAILED", { fields: { cursor: "invalid cursor" } });
  return { at, id };
}

export async function auditList(ctx: RequestContext, input: AuditListRequest): Promise<AuditListResponse> {
  requireRole(ctx, "audit.list");
  const db = getDb();
  const where: SQL[] = [];
  if (input.action) where.push(eq(auditLog.action, input.action));
  // from/to are local dates of the branch (R-20), both inclusive
  if (input.from) where.push(gte(auditLog.createdAt, new Date(localDayBounds({ date: input.from, timezone: ctx.timezone }).start)));
  if (input.to) where.push(lt(auditLog.createdAt, new Date(localDayBounds({ date: input.to, timezone: ctx.timezone }).end)));
  if (input.cursor) {
    const c = decodeCursor(input.cursor);
    const older = or(lt(auditLog.createdAt, c.at), and(eq(auditLog.createdAt, c.at), lt(auditLog.id, c.id)));
    if (older) where.push(older);
  }
  const rows = (await tenantDb(ctx, db)
    .select(auditLog, and(...where))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(input.limit + 1)) as (typeof auditLog.$inferSelect)[];
  const page = rows.slice(0, input.limit);

  const idsOf = (type: string) => [...new Set(page.filter((r) => r.actorType === type && r.actorId).map((r) => r.actorId as string))];
  const staffIds = idsOf("staff");
  const adminIds = idsOf("platform_admin");
  const names = new Map<string, string>();
  if (staffIds.length) {
    const staff = (await tenantDb(ctx, db).select(staffUser, inArray(staffUser.id, staffIds))) as (typeof staffUser.$inferSelect)[];
    for (const s of staff) names.set(`staff:${s.id}`, s.displayName);
  }
  if (adminIds.length) {
    // platform_admin is a platform table without organization_id
    const admins = await db
      .select({ id: platformAdmin.id, displayName: platformAdmin.displayName })
      .from(platformAdmin)
      .where(inArray(platformAdmin.id, adminIds));
    for (const a of admins) names.set(`platform_admin:${a.id}`, a.displayName);
  }

  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action,
      actorType: r.actorType,
      actorName: r.actorId ? (names.get(`${r.actorType}:${r.actorId}`) ?? null) : null,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before ?? null,
      after: r.after ?? null,
      reason: r.reason,
      at: r.createdAt.toISOString(),
      viaSupport: r.supportAccessLogId !== null,
    })),
    nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null,
  };
}
