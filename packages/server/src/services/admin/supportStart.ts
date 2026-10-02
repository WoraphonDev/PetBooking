import type { AdminSupportStartRequest, AdminSupportStartResponse } from "@app/contracts/endpoints/admin.supportStart";
import { branch, organization, session, staffUser, supportAccessLog } from "@app/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { sessionCookie } from "../../auth/cookies.ts";
import { createSession } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** 01 §4 Support mode: a read-only owner-like session for 60 minutes */
const SUPPORT_TTL_MS = 60 * 60_000;
/** 06#scr-C-01 */
const CONSOLE_HOME = "/console";

/**
 * Opens support mode for one shop: support_access_log + a `session` (subject platform_admin, support_access_log_id set,
 * first branch, 60 min) handed out as the staff cookie `sid`; audit `support.session_start`; notify every active owner.
 */
export async function adminSupportStart(
  ctx: RequestContext,
  input: AdminSupportStartRequest,
  http: HttpExtras,
): Promise<AdminSupportStartResponse> {
  const adminId = ctx.actor.id;
  if (ctx.actor.type !== "admin" || !adminId) throw new AppError("FORBIDDEN");
  const opened = await withTx(ctx, async (tx) => {
    const [org] = await tx.select().from(organization).where(eq(organization.id, input.organizationId));
    if (!org) throw new AppError("NOT_FOUND");
    const scoped: RequestContext = { ...ctx, orgId: org.id };
    const db = tenantDb(scoped, tx);
    const [firstBranch] = (await db.select(branch).orderBy(asc(branch.createdAt)).limit(1)) as (typeof branch.$inferSelect)[];

    const [log] = (await db.insert(supportAccessLog, {
      platformAdminId: adminId,
      reason: input.reason,
      ticketRef: input.ticketRef ?? null,
      readOnly: true,
      startedAt: ctx.now,
      createdAt: ctx.now,
    })) as (typeof supportAccessLog.$inferSelect)[];
    if (!log) throw new Error("adminSupportStart: support_access_log insert returned nothing");

    const created = await createSession(
      tx,
      {
        subjectType: "platform_admin",
        subjectId: adminId,
        organizationId: org.id,
        branchId: firstBranch?.id ?? null,
        supportAccessLogId: log.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      ctx.now,
    );
    const expiresAt = new Date(ctx.now.getTime() + SUPPORT_TTL_MS);
    await tx.update(session).set({ expiresAt }).where(eq(session.id, created.session.id));

    await writeAudit(
      tx,
      { ...scoped, supportAccessLogId: log.id },
      {
        action: "support.session_start",
        entityType: "support_access_log",
        entityId: log.id,
        after: { reason: log.reason, ticketRef: log.ticketRef },
      },
    );
    const owners = (await db.select(
      staffUser,
      and(eq(staffUser.role, "owner"), eq(staffUser.status, "active")),
    )) as (typeof staffUser.$inferSelect)[];
    for (const owner of owners)
      await enqueueNotification(
        tx,
        { ...scoped, branchId: firstBranch?.id ?? null, timezone: firstBranch?.timezone ?? ctx.timezone },
        {
          key: "owner.support_access",
          recipient: { type: "staff", id: owner.id },
          payload: { reason: log.reason },
          dedupeKey: `support_access:${log.id}`,
        },
      );
    return { token: created.token, expiresAt };
  });
  http.setCookie(sessionCookie("staff", opened.token, opened.expiresAt));
  return { redirectUrl: CONSOLE_HOME };
}
