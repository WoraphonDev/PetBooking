import { auditLog, booking, bookingEvent, groomAppointment, groomStation, notification, pet, refund, scheduledJob } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/approval_overdue.ts";
import { runJobs } from "../../src/jobs/runner.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(() => env.close());
// one shared groomer: free the no-overlap constraint between tests
afterEach(() => env.db.delete(groomAppointment));

const minutes = (n: number) => new Date(TEST_NOW.getTime() + n * 60_000);
const policySnapshot = {
  groomingFreeCancelHours: 24,
  hotelFreeCancelHours: 72,
  daycareFreeCancelHours: 24,
  lateCancelForfeitPercent: 100,
  cancelRefundMode: "credit",
};
let seq = 0;

async function seedBooking(org: SeedOrg, values: Partial<typeof booking.$inferInsert> = {}) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const firstServiceAt = values.firstServiceAt ?? minutes(600);
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      channel: "line_liff",
      bookingNo: `B6910-${String(++seq).padStart(4, "0")}`,
      createdByType: "customer",
      policySnapshot,
      status: "awaiting_approval",
      depositStatus: "not_required",
      approvalDueAt: TEST_NOW,
      firstServiceAt,
      ...values,
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "มะลิ", species: "dog" })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const end = new Date(firstServiceAt.getTime() + 3_600_000);
  await env.db.insert(groomAppointment).values({
    ...tenant,
    bookingId: bk?.id ?? "",
    petId: p?.id ?? "",
    groomerId: org.staff.staff,
    stationId: station?.id ?? "",
    groomerPreference: "any",
    startsAt: firstServiceAt,
    endsAt: end,
    blockedUntil: end,
    status: "scheduled",
  });
  if (!bk) throw new Error("missing booking");
  return bk;
}

async function run(org: SeedOrg, bookingId: string, n = 1) {
  const [row] = await env.db
    .insert(scheduledJob)
    .values({
      organizationId: org.orgId,
      jobType: "approval_overdue",
      runAt: TEST_NOW,
      payload: { bookingId, n },
      dedupeKey: `approval_overdue:${bookingId}:${n}:t${++seq}`,
    })
    .returning();
  if (!row) throw new Error("missing job");
  const ctx = makeSystemCtx(org.orgId, TEST_NOW);
  await withTx(ctx, (tx) => handler(tx, ctx, row));
}
const alerts = (bookingId: string) =>
  env.db
    .select()
    .from(notification)
    .then((rows) => rows.filter((r) => r.dedupeKey.startsWith(`approval_overdue:${bookingId}:`)));
const nextJobs = (bookingId: string) =>
  env.db
    .select()
    .from(scheduledJob)
    .then((rows) => rows.filter((r) => /^approval_overdue:[^:]+:\d+$/.test(r.dedupeKey) && r.dedupeKey.includes(bookingId)));
const bookingOf = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];

it("alerts front_desk and owner, then schedules the next round", async () => {
  const bk = await seedBooking(env.base);
  await env.db.insert(scheduledJob).values({
    organizationId: env.base.orgId,
    jobType: "approval_overdue",
    runAt: TEST_NOW,
    payload: { bookingId: bk.id, n: 1 },
    dedupeKey: `approval_overdue:${bk.id}:1`,
  });
  expect(await runJobs(makeSystemCtx(null, TEST_NOW), { approval_overdue: handler })).toEqual({ processed: 1, failed: 0 });

  const rows = await alerts(bk.id);
  expect(rows.map((r) => r.recipientId).sort()).toEqual([env.base.staff.front_desk, env.base.staff.owner].sort());
  for (const row of rows)
    expect(row).toMatchObject({
      branchId: env.base.branchId,
      templateKey: "staff.approval_overdue",
      dedupeKey: `approval_overdue:${bk.id}:1:${row.recipientId}`,
      // approval_due_at = now, default approval_timeout_minutes = 120
      payload: { bookingNo: bk.bookingNo, waitedMinutes: 120 },
    });
  const jobs = await nextJobs(bk.id);
  expect(jobs.find((j) => j.dedupeKey === `approval_overdue:${bk.id}:2`)).toMatchObject({
    status: "pending",
    runAt: minutes(120),
    payload: { bookingId: bk.id, n: 2 },
  });
  expect((await bookingOf(bk.id))?.status).toBe("awaiting_approval");

  // retrying round 1 does not alert twice
  await run(env.base, bk.id, 1);
  expect(await alerts(bk.id)).toHaveLength(2);
});

it("schedules the next round no later than the first service", async () => {
  const bk = await seedBooking(env.base, { firstServiceAt: minutes(45) });
  await run(env.base, bk.id, 3);
  expect((await nextJobs(bk.id)).find((j) => j.dedupeKey === `approval_overdue:${bk.id}:4`)?.runAt).toEqual(minutes(45));
});

it("expires the booking at first_service_at and cancels its children (no deposit)", async () => {
  const bk = await seedBooking(env.base, { firstServiceAt: TEST_NOW });
  await run(env.base, bk.id, 2);
  expect(await bookingOf(bk.id)).toMatchObject({ status: "expired", depositStatus: "not_required" });
  expect((await env.db.select().from(groomAppointment).where(eq(groomAppointment.bookingId, bk.id)))[0]?.status).toBe("cancelled");
  expect(await env.db.select().from(refund).where(eq(refund.bookingId, bk.id))).toHaveLength(0);
  expect(await alerts(bk.id)).toHaveLength(0);
  expect(await nextJobs(bk.id)).toHaveLength(0);
});

it("refunds a verified deposit in full (R-07 shop_cancel) with an audit entry", async () => {
  const bk = await seedBooking(env.base, { firstServiceAt: minutes(-5), depositStatus: "verified", depositVerifiedSatang: 30_000 });
  await run(env.base, bk.id, 2);
  expect(await bookingOf(bk.id)).toMatchObject({ status: "expired", depositStatus: "refunded" });
  const [row] = await env.db.select().from(refund).where(eq(refund.bookingId, bk.id));
  expect(row).toMatchObject({
    organizationId: env.base.orgId,
    customerId: env.base.customerId,
    amountSatang: 30_000,
    mode: "bank_transfer",
    createdBy: env.base.staff.owner,
    createdAt: TEST_NOW,
  });
  expect(
    await env.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "refund.create"), eq(auditLog.entityId, row?.id ?? ""))),
  ).toMatchObject([
    { organizationId: env.base.orgId, actorType: "system", after: { amountSatang: 30_000, mode: "bank_transfer" }, createdAt: TEST_NOW },
  ]);
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bk.id));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual(
    expect.arrayContaining([
      ["booking", "awaiting_approval", "expired"],
      ["groom_appointment", "scheduled", "cancelled"],
      ["deposit", "verified", "refunded"],
    ]),
  );
});

it("does nothing once the booking left awaiting_approval or belongs to another organization", async () => {
  const confirmed = await seedBooking(env.base, { status: "confirmed", firstServiceAt: minutes(-5) });
  await run(env.base, confirmed.id);
  expect((await bookingOf(confirmed.id))?.status).toBe("confirmed");
  expect(await alerts(confirmed.id)).toHaveLength(0);

  const foreign = await seedBooking(other, { firstServiceAt: minutes(-5) });
  await run(env.base, foreign.id);
  expect((await bookingOf(foreign.id))?.status).toBe("awaiting_approval");
  expect(await nextJobs(foreign.id)).toHaveLength(0);
});
