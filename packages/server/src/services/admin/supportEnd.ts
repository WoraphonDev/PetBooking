import type { AdminSupportEndRequest, AdminSupportEndResponse } from "@app/contracts/endpoints/admin.supportEnd";
import { session, supportAccessLog } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";

/** Ends support mode: stamps ended_at and deletes the support session(s) (01 §4); ending twice is a no-op. */
export async function adminSupportEnd(ctx: RequestContext, input: AdminSupportEndRequest): Promise<AdminSupportEndResponse> {
  if (ctx.actor.type !== "admin" || !ctx.actor.id) throw new AppError("FORBIDDEN");
  await withTx(ctx, async (tx) => {
    // support_access_log is reached by id across shops: the platform admin is not tied to one organization
    const [log] = await tx.select().from(supportAccessLog).where(eq(supportAccessLog.id, input.supportId)).for("update");
    if (!log) throw new AppError("NOT_FOUND");
    await tx.delete(session).where(eq(session.supportAccessLogId, log.id));
    if (log.endedAt) return;
    await tx.update(supportAccessLog).set({ endedAt: ctx.now }).where(eq(supportAccessLog.id, log.id));
    await writeAudit(
      tx,
      { ...ctx, orgId: log.organizationId, supportAccessLogId: log.id },
      {
        action: "support.session_end",
        entityType: "support_access_log",
        entityId: log.id,
        before: { endedAt: null },
        after: { endedAt: ctx.now.toISOString() },
      },
    );
  });
}
