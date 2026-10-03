import { scheduledJob } from "@app/db/schema";
import { and, asc, eq, isNull, lt, lte, type SQL } from "drizzle-orm";
import { makeSystemCtx, type RequestContext } from "../context.ts";
import { getDb, type Tx } from "../db.ts";
import { tenantDb } from "../repo/tenant.ts";

export type Job = typeof scheduledJob.$inferSelect;
export type JobHandler = (tx: Tx, ctx: RequestContext, job: Job) => Promise<void>;
export type JobHandlers = Partial<Record<Job["jobType"], JobHandler>>;
function update(tx: Tx, ctx: RequestContext, job: Job, values: Partial<typeof scheduledJob.$inferInsert>, guard?: SQL) {
  const where = and(eq(scheduledJob.id, job.id), guard ?? and(eq(scheduledJob.status, "running"), eq(scheduledJob.lockedAt, ctx.now)));
  return job.organizationId
    ? tenantDb(ctx, tx).update(scheduledJob, values, where)
    : tx
        .update(scheduledJob)
        .set(values)
        .where(and(where, isNull(scheduledJob.organizationId)));
}

/** Cross-tenant system claim; each handler runs with its job's tenant context. */
export async function runJobs(ctx: RequestContext, handlers: JobHandlers) {
  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const staleGuard = and(eq(scheduledJob.status, "running"), lt(scheduledJob.lockedAt, new Date(ctx.now.getTime() - 600_000)));
    const stale = await tx.select().from(scheduledJob).where(staleGuard).for("update", { skipLocked: true });
    for (const row of stale)
      await update(
        tx,
        makeSystemCtx(row.organizationId, ctx.now),
        row,
        { status: "pending", lockedAt: null, updatedAt: ctx.now },
        staleGuard,
      );
    const rows = await tx
      .select()
      .from(scheduledJob)
      .where(and(eq(scheduledJob.status, "pending"), lte(scheduledJob.runAt, ctx.now)))
      .orderBy(asc(scheduledJob.runAt), asc(scheduledJob.id))
      .limit(50)
      .for("update", { skipLocked: true });
    for (const row of rows)
      await update(
        tx,
        makeSystemCtx(row.organizationId, ctx.now),
        row,
        { status: "running", lockedAt: ctx.now, updatedAt: ctx.now },
        eq(scheduledJob.status, "pending"),
      );
    return rows;
  });
  let processed = 0,
    failed = 0;
  for (const job of claimed) {
    const jobCtx = makeSystemCtx(job.organizationId, ctx.now);
    try {
      await db.transaction(async (tx) => {
        const handler = handlers[job.jobType];
        if (!handler) throw new Error(`job handler not implemented: ${job.jobType}`);
        await handler(tx, jobCtx, job);
        await update(tx, jobCtx, job, { status: "done", lockedAt: null, finishedAt: ctx.now, lastError: null, updatedAt: ctx.now });
      });
      processed++;
    } catch {
      const attempts = job.attempts + 1;
      await db.transaction((tx) =>
        update(tx, jobCtx, job, {
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          runAt: new Date(ctx.now.getTime() + 2 ** attempts * 60_000),
          lockedAt: null,
          lastError: "job handler failed",
          updatedAt: ctx.now,
        }),
      );
      failed++;
    }
  }
  return { processed, failed };
}
