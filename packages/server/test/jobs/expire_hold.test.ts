import {
  booking,
  bookingEvent,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomStation,
  notification,
  pet,
  roomType,
  roomUnit,
  scheduledJob,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/expire_hold.ts";
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

const minutes = (n: number) => new Date(TEST_NOW.getTime() + n * 60_000);
let seq = 0;

async function seedHold(org: SeedOrg, values: Partial<typeof booking.$inferInsert> = {}) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      channel: "line_liff",
      bookingNo: `B6910-${String(++seq).padStart(4, "0")}`,
      createdByType: "customer",
      policySnapshot: {},
      status: "awaiting_deposit",
      depositStatus: "pending",
      holdExpiresAt: TEST_NOW,
      ...values,
    })
    .returning();
  if (!bk) throw new Error("missing booking");
  return bk;
}

async function seedChildren(org: SeedOrg, bookingId: string) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mali", species: "dog" })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `Table ${seq}` })
    .returning();
  const base = { ...tenant, bookingId, petId: p?.id ?? "" };
  const groom = (status: "scheduled" | "cancelled", hour: number) => ({
    ...base,
    groomerId: org.staff.staff,
    stationId: station?.id ?? "",
    groomerPreference: "any" as const,
    startsAt: minutes(60 * hour),
    endsAt: minutes(60 * hour + 60),
    blockedUntil: minutes(60 * hour + 60),
    status,
  });
  await env.db.insert(groomAppointment).values([groom("scheduled", 24), groom("cancelled", 26)]);
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "Room" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: `R${seq}` })
    .returning();
  await env.db.insert(stay).values({
    ...base,
    roomTypeId: type?.id ?? "",
    roomUnitId: unit?.id ?? "",
    checkInDate: "2026-10-06",
    checkOutDate: "2026-10-07",
    expectedCheckInTime: "09:00",
    nights: 1,
    nightlyPriceSatang: 50000,
    roomTotalSatang: 50000,
    status: "reserved",
  });
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "Day", startsAt: "09:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db
    .insert(daycareVisit)
    .values({ ...base, sessionTypeId: session?.id ?? "", visitDate: "2026-10-06", priceSatang: 30000, status: "reserved" });
}

function job(org: SeedOrg, bookingId: string) {
  return {
    organizationId: org.orgId,
    jobType: "expire_hold" as const,
    runAt: TEST_NOW,
    payload: { bookingId },
    dedupeKey: `expire_hold:${bookingId}`,
  };
}
async function run(org: SeedOrg, bookingId: string) {
  const ctx = makeSystemCtx(org.orgId, TEST_NOW);
  const [row] = await env.db
    .insert(scheduledJob)
    .values({ ...job(org, bookingId), dedupeKey: `expire_hold:${bookingId}:retry${++seq}` })
    .returning();
  if (!row) throw new Error("missing job");
  await withTx(ctx, (tx) => handler(tx, ctx, row));
}
const statusOf = async (bookingId: string) => (await env.db.select().from(booking).where(eq(booking.id, bookingId)))[0];
const notificationsFor = (bookingId: string) =>
  env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `hold_expired:${bookingId}:${env.base.customerId}`));

it("expires an unpaid hold at hold_expires_at, cancels the children and notifies the customer once", async () => {
  const bk = await seedHold(env.base);
  await seedChildren(env.base, bk.id);
  const [row] = await env.db.insert(scheduledJob).values(job(env.base, bk.id)).returning();
  expect(await runJobs(makeSystemCtx(null, TEST_NOW), { expire_hold: handler })).toEqual({ processed: 1, failed: 0 });
  expect(
    (
      await env.db
        .select()
        .from(scheduledJob)
        .where(eq(scheduledJob.id, row?.id ?? ""))
    )[0]?.status,
  ).toBe("done");

  expect(await statusOf(bk.id)).toMatchObject({ status: "expired", depositStatus: "pending", updatedAt: TEST_NOW });
  const grooms = await env.db.select().from(groomAppointment).where(eq(groomAppointment.bookingId, bk.id));
  expect(grooms.map((g) => g.status)).toEqual(["cancelled", "cancelled"]);
  expect((await env.db.select().from(stay).where(eq(stay.bookingId, bk.id)))[0]?.status).toBe("cancelled");
  expect((await env.db.select().from(daycareVisit).where(eq(daycareVisit.bookingId, bk.id)))[0]?.status).toBe("cancelled");

  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bk.id));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus, e.actorType, e.createdAt])).toEqual(
    expect.arrayContaining([
      ["booking", "awaiting_deposit", "expired", "system", TEST_NOW],
      ["groom_appointment", "scheduled", "cancelled", "system", TEST_NOW],
      ["stay", "reserved", "cancelled", "system", TEST_NOW],
      ["daycare_visit", "reserved", "cancelled", "system", TEST_NOW],
    ]),
  );
  // the already-cancelled appointment is left alone
  expect(events).toHaveLength(4);

  expect(await notificationsFor(bk.id)).toMatchObject([
    {
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      recipientType: "customer",
      recipientId: env.base.customerId,
      templateKey: "customer.hold_expired",
      payload: { bookingNo: bk.bookingNo, bookAgainUrl: "https://app.test/liff/shop-a" },
      monthKey: "2026-10",
      status: "queued",
    },
  ]);

  // a retried job finds the booking already expired and does nothing
  await run(env.base, bk.id);
  expect(await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bk.id))).toHaveLength(4);
  expect(await notificationsFor(bk.id)).toHaveLength(1);
});

it("does nothing while the hold is still running", async () => {
  const bk = await seedHold(env.base, { holdExpiresAt: minutes(1) });
  await run(env.base, bk.id);
  expect(await statusOf(bk.id)).toMatchObject({ status: "awaiting_deposit" });
  expect(await notificationsFor(bk.id)).toHaveLength(0);
});

it.each([
  ["deposit_review", null],
  ["confirmed", null],
  ["cancelled", null],
] as const)("leaves a %s booking untouched", async (status, holdExpiresAt) => {
  const bk = await seedHold(env.base, { status, holdExpiresAt, depositStatus: status === "deposit_review" ? "submitted" : "pending" });
  await run(env.base, bk.id);
  expect((await statusOf(bk.id))?.status).toBe(status);
  expect(await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bk.id))).toHaveLength(0);
  expect(await notificationsFor(bk.id)).toHaveLength(0);
});

it("does nothing when the hold was renewed to a later time", async () => {
  const bk = await seedHold(env.base, { holdExpiresAt: minutes(30) });
  await run(env.base, bk.id);
  expect((await statusOf(bk.id))?.status).toBe("awaiting_deposit");
});

it("never touches another organization's booking", async () => {
  const foreign = await seedHold(other);
  await run(env.base, foreign.id);
  expect((await statusOf(foreign.id))?.status).toBe("awaiting_deposit");
});
