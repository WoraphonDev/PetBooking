import { booking, groomAppointment, groomStation, notification, pet, petShopProfile, scheduledJob } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/next_groom_reminder.ts";
import { runJobs } from "../../src/jobs/runner.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://app.test");
  return () => vi.unstubAllEnvs();
});

// TEST_NOW = 2026-10-05 10:00 Asia/Bangkok; last visit 2026-09-10 + 28 days (default) → due 2026-10-08, remind 2026-10-05
let hour = 0;
const bkk = (date: string) => new Date(`${date}T${String(8 + (hour++ % 10)).padStart(2, "0")}:00:00+07:00`);

async function seedPet(org: SeedOrg, opts: { status?: "active" | "rehomed"; future?: boolean; interval?: number } = {}) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "มะลิ", species: "dog", status: opts.status ?? "active" })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      channel: "walk_in",
      bookingNo: `B-${p?.id}`,
      createdByType: "staff",
      policySnapshot: {},
      status: "closed",
      depositStatus: "not_required",
    })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T-${p?.id}` })
    .returning();
  const appt = (startsAt: Date, status: "picked_up" | "scheduled") => {
    const end = new Date(startsAt.getTime() + 3_600_000);
    return {
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: org.staff.staff,
      stationId: station?.id ?? "",
      groomerPreference: "any" as const,
      startsAt,
      endsAt: end,
      blockedUntil: end,
      status,
    };
  };
  await env.db
    .insert(groomAppointment)
    .values([
      appt(bkk("2026-08-13"), "picked_up"),
      appt(bkk("2026-09-10"), "picked_up"),
      ...(opts.future ? [appt(bkk("2026-10-20"), "scheduled")] : []),
    ]);
  if (opts.interval)
    await env.db.insert(petShopProfile).values({ organizationId: org.orgId, petId: p?.id ?? "", groomIntervalDays: opts.interval });
  return p?.id ?? "";
}

async function run(org: SeedOrg, petId: string) {
  const [row] = await env.db
    .insert(scheduledJob)
    .values({
      organizationId: org.orgId,
      jobType: "next_groom_reminder",
      runAt: TEST_NOW,
      payload: { petId, organizationId: org.orgId },
      dedupeKey: `next_groom:${petId}:${hour++}`,
    })
    .returning();
  if (!row) throw new Error("missing job");
  const ctx = makeSystemCtx(org.orgId, TEST_NOW);
  await withTx(ctx, (tx) => handler(tx, ctx, row));
}
const reminders = (petId: string) =>
  env.db
    .select()
    .from(notification)
    .then((rows) => rows.filter((r) => r.dedupeKey.startsWith(`next_groom:${petId}:`)));

it("recomputes R-17 and reminds the customer on remindOn, once", async () => {
  const petId = await seedPet(env.base);
  await env.db.insert(scheduledJob).values({
    organizationId: env.base.orgId,
    jobType: "next_groom_reminder",
    runAt: TEST_NOW,
    payload: { petId, organizationId: env.base.orgId },
    dedupeKey: `next_groom:${petId}`,
  });
  expect(await runJobs(makeSystemCtx(null, TEST_NOW), { next_groom_reminder: handler })).toEqual({ processed: 1, failed: 0 });
  expect(await reminders(petId)).toMatchObject([
    {
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      recipientType: "customer",
      recipientId: env.base.customerId,
      templateKey: "customer.next_groom_reminder",
      dedupeKey: `next_groom:${petId}:2026-10-08:${env.base.customerId}`,
      payload: { petName: "มะลิ", dueDate: "8 ต.ค. 2569", bookUrl: "https://app.test/liff/shop-a/book/grooming" },
      status: "queued",
    },
  ]);
  await run(env.base, petId);
  expect(await reminders(petId)).toHaveLength(1);
});

it("does not remind when a future appointment exists, the pet left, or remindOn moved", async () => {
  const booked = await seedPet(env.base, { future: true });
  const rehomed = await seedPet(env.base, { status: "rehomed" });
  // shop interval 21 days → due 2026-10-01, remindOn 2026-09-28 (not today)
  const shopInterval = await seedPet(env.base, { interval: 21 });
  for (const petId of [booked, rehomed, shopInterval]) {
    await run(env.base, petId);
    expect(await reminders(petId)).toHaveLength(0);
  }
});

it("ignores another organization's visits", async () => {
  const petId = await seedPet(other);
  await run(env.base, petId);
  expect(await reminders(petId)).toHaveLength(0);
});
