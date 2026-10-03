import { scheduledJob } from "@app/db/schema";
import { and, eq, like } from "drizzle-orm";
import { makeSystemCtx, type RequestContext } from "../context.ts";
import type { Tx } from "../db.ts";
import { tenantDb } from "../repo/tenant.ts";

type JobInput = { type: typeof scheduledJob.$inferInsert.jobType; runAt: Date; payload: unknown; dedupeKey: string; orgId: string | null };
export async function scheduleJob(tx: Tx, input: JobInput) {
  const values = { jobType: input.type, runAt: input.runAt, payload: input.payload, dedupeKey: input.dedupeKey };
  if (input.orgId) return tenantDb(makeSystemCtx(input.orgId, input.runAt), tx).insert(scheduledJob, values).onConflictDoNothing();
  return tx
    .insert(scheduledJob)
    .values({ organizationId: null, ...values })
    .onConflictDoNothing()
    .returning();
}

/** The context pins cancellation to its tenant and supplies the sole clock. */
export async function cancelJobs(tx: Tx, dedupePrefix: string, ctx: RequestContext) {
  const prefix = dedupePrefix.replace(/[\\%_]/g, "\\$&");
  return tenantDb(makeSystemCtx(ctx.orgId, ctx.now), tx).update(
    scheduledJob,
    { status: "cancelled", updatedAt: ctx.now },
    and(eq(scheduledJob.status, "pending"), like(scheduledJob.dedupeKey, `${prefix}%`)),
  );
}
