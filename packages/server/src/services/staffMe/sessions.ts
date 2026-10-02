import type { StaffMeSessionsRequest, StaffMeSessionsResponse } from "@app/contracts/endpoints/staffMe.sessions";
import { session } from "@app/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** the signed-in staff member's unexpired sessions, most recently used first */
export async function staffMeSessions(
  ctx: RequestContext,
  _input: StaffMeSessionsRequest,
  http: HttpExtras,
): Promise<StaffMeSessionsResponse> {
  if (ctx.actor.type !== "staff" || !ctx.actor.id) throw new AppError("FORBIDDEN");
  const rows = (await tenantDb(ctx, getDb())
    .select(session, and(eq(session.subjectType, "staff"), eq(session.subjectId, ctx.actor.id), gt(session.expiresAt, ctx.now)))
    .orderBy(desc(session.lastSeenAt), desc(session.id))) as (typeof session.$inferSelect)[];
  return rows.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.id === http.session?.id,
  }));
}
