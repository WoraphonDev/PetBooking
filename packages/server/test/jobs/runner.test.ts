import { branchPolicy, scheduledJob } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { withTx } from "../../src/db.ts";
import { runJobs } from "../../src/jobs/runner.ts";
import { cancelJobs, scheduleJob } from "../../src/jobs/schedule.ts";
import { seedJobs } from "../../src/jobs/seed.ts";
import { setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
const ctx = () => staffCtx(env.base, "owner");
async function add(key: string, extra: Partial<typeof scheduledJob.$inferInsert> = {}) {
  const [row] = await env.db
    .insert(scheduledJob)
    .values({ organizationId: env.base.orgId, jobType: "expire_hold", runAt: TEST_NOW, payload: {}, dedupeKey: key, ...extra })
    .returning();
  if (!row) throw new Error("missing job");
  return row;
}
async function read(id: string) {
  return (await env.db.select().from(scheduledJob).where(eq(scheduledJob.id, id)))[0];
}

it("deduplicates schedules and cancels only pending jobs with a literal prefix", async () => {
  const input = { type: "expire_hold" as const, runAt: TEST_NOW, payload: {}, dedupeKey: "cancel:%_literal:one", orgId: env.base.orgId };
  await withTx(ctx(), async (tx) => {
    await scheduleJob(tx, input);
    await scheduleJob(tx, input);
  });
  const unrelated = await add("cancel:other");
  const running = await add("cancel:%_literal:running", { status: "running", lockedAt: TEST_NOW });
  await withTx(ctx(), (tx) => cancelJobs(tx, "cancel:%_literal:", ctx()));
  const rows = await env.db.select().from(scheduledJob).where(eq(scheduledJob.dedupeKey, input.dedupeKey));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.status).toBe("cancelled");
  expect((await read(unrelated.id))?.status).toBe("pending");
  expect((await read(running.id))?.status).toBe("running");
  await env.db.delete(scheduledJob);
});

it("claims each due job once with two concurrent runners and excludes future jobs", async () => {
  const due = await add("concurrent");
  const future = await add("future", { runAt: new Date(TEST_NOW.getTime() + 60_000) });
  const calls: string[] = [];
  const handlers = {
    expire_hold: async (_tx: unknown, _ctx: unknown, row: typeof due) => {
      calls.push(row.id);
    },
  };
  await Promise.all([runJobs(ctx(), handlers), runJobs(ctx(), handlers)]);
  expect(calls).toEqual([due.id]);
  expect((await read(due.id))?.status).toBe("done");
  expect((await read(due.id))?.finishedAt).toEqual(TEST_NOW);
  expect((await read(future.id))?.status).toBe("pending");
  await env.db.delete(scheduledJob);
});

it("rolls handler writes back, retries after two minutes and fails at attempt five", async () => {
  const first = await add("retry");
  const last = await add("terminal", { attempts: 4 });
  const handlers = {
    expire_hold: async (tx: Parameters<Parameters<typeof withTx>[1]>[0]) => {
      await tx.insert(scheduledJob).values({ jobType: "expire_hold", runAt: TEST_NOW, payload: {}, dedupeKey: "rollback" });
      throw new Error("handler failed");
    },
  };
  expect(await runJobs(ctx(), handlers)).toEqual({ processed: 0, failed: 2 });
  expect(await read(first.id)).toMatchObject({
    status: "pending",
    attempts: 1,
    runAt: new Date(TEST_NOW.getTime() + 120_000),
    lockedAt: null,
  });
  expect(await read(last.id)).toMatchObject({ status: "failed", attempts: 5, lockedAt: null });
  expect(await env.db.select().from(scheduledJob).where(eq(scheduledJob.dedupeKey, "rollback"))).toEqual([]);
  await env.db.delete(scheduledJob);
});

it("recovers locks older than ten minutes and respects the fifty-job batch limit", async () => {
  await add("stale", { status: "running", lockedAt: new Date(TEST_NOW.getTime() - 600_001) });
  for (let i = 0; i < 50; i++) await add(`batch:${i}`);
  const fresh = await add("fresh", { status: "running", lockedAt: TEST_NOW });
  expect(await runJobs(ctx(), { expire_hold: async () => {} })).toEqual({ processed: 50, failed: 0 });
  expect((await read(fresh.id))?.status).toBe("running");
  expect(await env.db.select().from(scheduledJob).where(eq(scheduledJob.status, "pending"))).toHaveLength(1);
});

it("seeds recurring jobs once per local date/quarter-hour with branch-local daily summaries", async () => {
  await env.db.delete(scheduledJob);
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, dailySummaryTime: "20:00" });
  await seedJobs(ctx());
  await seedJobs(ctx());
  const jobs = await env.db.select().from(scheduledJob);
  expect(jobs).toHaveLength(5);
  expect(jobs.find((j) => j.jobType === "owner_daily_summary")).toMatchObject({
    organizationId: env.base.orgId,
    runAt: new Date("2026-10-05T13:00:00Z"),
    payload: { branchId: env.base.branchId, localDate: "2026-10-05" },
  });
  expect(jobs.find((j) => j.jobType === "package_expiry")?.runAt).toEqual(new Date("2026-10-04T17:10:00Z"));
  expect(jobs.find((j) => j.jobType === "care_task_overdue_scan")?.dedupeKey).toBe("care_task_overdue_scan:202610051000/15");
});
