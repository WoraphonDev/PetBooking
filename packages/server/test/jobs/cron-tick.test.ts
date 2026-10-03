import { CronTickResponse } from "@app/contracts/endpoints/cron.tick";
import { scheduledJob } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cronTick, withCronSecret } from "../../src/services/cron/tick.ts";
import { setupTestDb, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
const handled = vi.fn();
// test handlers: every type succeeds (seeded recurring jobs may already be due) except reminder_24h
const ok = async () => {};
const POST = withCronSecret((ctx) =>
  cronTick(ctx, {
    expire_hold: async (_tx, _ctx, job) => handled(job.dedupeKey),
    reminder_24h: async () => {
      throw new Error("boom");
    },
    next_groom_reminder: ok,
    owner_daily_summary: ok,
    approval_overdue: ok,
    care_task_overdue_scan: ok,
    recompute_reliability: ok,
    package_expiry: ok,
    cleanup_uncommitted_files: ok,
  }),
);
beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
  handled.mockReset();
});
const tick = (secret?: string) =>
  POST(
    new Request("https://petbooking.test/api/cron/tick", {
      method: "POST",
      headers: secret === undefined ? {} : { "x-cron-secret": secret },
    }),
  );
const due = (dedupeKey: string, jobType: "expire_hold" | "reminder_24h") => ({
  organizationId: env.base.orgId,
  jobType,
  runAt: new Date(Date.now() - 60_000),
  payload: {},
  dedupeKey,
});

it("runs due jobs and answers {processed, failed}", async () => {
  await env.db.insert(scheduledJob).values([due("hold:1", "expire_hold"), due("r24:1", "reminder_24h")]);
  const response = await tick("s3cret");
  expect(response.status).toBe(200);
  const body = CronTickResponse.parse(await response.json());
  expect(body.failed).toBe(1);
  const done = await env.db.select().from(scheduledJob).where(eq(scheduledJob.status, "done"));
  expect(body.processed).toBe(done.length);
  expect(done.map((j) => j.dedupeKey)).toContain("hold:1");
  expect(handled).toHaveBeenCalledWith("hold:1");
  const [failed] = await env.db.select().from(scheduledJob).where(eq(scheduledJob.dedupeKey, "r24:1"));
  expect(failed).toMatchObject({ status: "pending", attempts: 1 });
});

it("seeds the recurring jobs on every tick without duplicating them", async () => {
  await tick("s3cret");
  const first = await env.db.select().from(scheduledJob);
  await tick("s3cret");
  const second = await env.db.select().from(scheduledJob);
  expect(first.map((j) => j.jobType)).toEqual(
    expect.arrayContaining(["recompute_reliability", "package_expiry", "cleanup_uncommitted_files"]),
  );
  expect(second.length).toBe(first.length);
});

it("refuses a missing or wrong secret, and any call when CRON_SECRET is unset, with CRON_FORBIDDEN", async () => {
  await env.db.insert(scheduledJob).values(due("hold:2", "expire_hold"));
  for (const secret of [undefined, "", "wrong", "S3CRET"]) {
    const response = await tick(secret);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "CRON_FORBIDDEN" } });
  }
  vi.stubEnv("CRON_SECRET", "");
  expect((await tick("")).status).toBe(401);
  expect(handled).not.toHaveBeenCalled();
  const [job] = await env.db.select().from(scheduledJob).where(eq(scheduledJob.dedupeKey, "hold:2"));
  expect(job?.status).toBe("pending");
});
