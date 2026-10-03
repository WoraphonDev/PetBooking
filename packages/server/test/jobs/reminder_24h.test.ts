import {
  booking,
  branchPolicy,
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
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/reminder_24h.ts";
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
// one shared groomer: free the no-overlap constraint between tests
afterEach(() => env.db.delete(groomAppointment));

// TEST_NOW = 2026-10-05 10:00 Asia/Bangkok → the visit is 2026-10-06 10:00
const TOMORROW = new Date(TEST_NOW.getTime() + 86_400_000);
let seq = 0;
type EntityType = "groom_appointment" | "stay" | "daycare_visit";

async function seedBooking(org: SeedOrg, status: "confirmed" | "cancelled" = "confirmed") {
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
      status,
      depositStatus: "not_required",
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "มะลิ", species: "dog" })
    .returning();
  if (!bk || !p) throw new Error("seed failed");
  return { bk, base: { ...tenant, bookingId: bk.id, petId: p.id } };
}

async function seedGroom(
  org: SeedOrg,
  opts: { startsAt?: Date; status?: "scheduled" | "cancelled"; bookingStatus?: "confirmed" | "cancelled" } = {},
) {
  const { bk, base } = await seedBooking(org, opts.bookingStatus);
  const [station] = await env.db
    .insert(groomStation)
    .values({ organizationId: org.orgId, branchId: org.branchId, name: `T${seq}` })
    .returning();
  const startsAt = opts.startsAt ?? TOMORROW;
  const end = new Date(startsAt.getTime() + 3_600_000);
  const [g] = await env.db
    .insert(groomAppointment)
    .values({
      ...base,
      groomerId: org.staff.staff,
      stationId: station?.id ?? "",
      groomerPreference: "any",
      startsAt,
      endsAt: end,
      blockedUntil: end,
      status: opts.status ?? "scheduled",
    })
    .returning();
  return { bk, entityId: g?.id ?? "" };
}

async function seedStay(org: SeedOrg, expectedCheckInTime: string | null) {
  const { bk, base } = await seedBooking(org);
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "Room" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: `R${seq}` })
    .returning();
  const [s] = await env.db
    .insert(stay)
    .values({
      ...base,
      roomTypeId: type?.id ?? "",
      roomUnitId: unit?.id ?? "",
      checkInDate: "2026-10-06",
      checkOutDate: "2026-10-07",
      expectedCheckInTime,
      nights: 1,
      nightlyPriceSatang: 50000,
      roomTotalSatang: 50000,
      status: "reserved",
    })
    .returning();
  return { bk, entityId: s?.id ?? "" };
}

async function seedDaycare(org: SeedOrg) {
  const { bk, base } = await seedBooking(org);
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      session: "morning",
      nameTh: "เช้า",
      startsAt: "10:00",
      endsAt: "13:00",
      capacity: 10,
    })
    .returning();
  const [d] = await env.db
    .insert(daycareVisit)
    .values({ ...base, sessionTypeId: session?.id ?? "", visitDate: "2026-10-06", priceSatang: 30000, status: "reserved" })
    .returning();
  return { bk, entityId: d?.id ?? "" };
}

async function run(org: SeedOrg, bookingId: string, entityType: EntityType, entityId: string, runAt = TEST_NOW) {
  const [row] = await env.db
    .insert(scheduledJob)
    .values({
      organizationId: org.orgId,
      jobType: "reminder_24h",
      runAt,
      payload: { bookingId, entityType, entityId },
      dedupeKey: `reminder_24h:${entityId}:${++seq}`,
    })
    .returning();
  if (!row) throw new Error("missing job");
  const ctx = makeSystemCtx(org.orgId, TEST_NOW);
  await withTx(ctx, (tx) => handler(tx, ctx, row));
}
const sent = (org: SeedOrg, entityId: string) =>
  env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `reminder_24h:${entityId}:${org.customerId}`));

it("reminds the customer about tomorrow's grooming through the job runner, once", async () => {
  const { bk, entityId } = await seedGroom(env.base);
  await env.db.insert(scheduledJob).values({
    organizationId: env.base.orgId,
    jobType: "reminder_24h",
    runAt: TEST_NOW,
    payload: { bookingId: bk.id, entityType: "groom_appointment", entityId },
    dedupeKey: `reminder_24h:${entityId}:${TOMORROW.toISOString()}`,
  });
  expect(await runJobs(makeSystemCtx(null, TEST_NOW), { reminder_24h: handler })).toEqual({ processed: 1, failed: 0 });
  expect(await sent(env.base, entityId)).toMatchObject([
    {
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      recipientType: "customer",
      recipientId: env.base.customerId,
      templateKey: "customer.reminder_24h",
      payload: {
        petName: "มะลิ",
        dateTime: "6 ต.ค. 2569 10:00 น.",
        service: "กรูม",
        bookingUrl: `https://app.test/liff/shop-a/bookings/${bk.id}`,
      },
      status: "queued",
    },
  ]);
  await run(env.base, bk.id, "groom_appointment", entityId);
  expect(await sent(env.base, entityId)).toHaveLength(1);
});

it("reminds about a hotel check-in with and without an expected time, and a daycare session", async () => {
  const timed = await seedStay(env.base, "10:00");
  await run(env.base, timed.bk.id, "stay", timed.entityId);
  expect((await sent(env.base, timed.entityId))[0]?.payload).toMatchObject({ dateTime: "6 ต.ค. 2569 10:00 น.", service: "โรงแรม" });

  const untimed = await seedStay(env.base, null);
  await run(env.base, untimed.bk.id, "stay", untimed.entityId);
  expect((await sent(env.base, untimed.entityId))[0]?.payload).toMatchObject({ dateTime: "6 ต.ค. 2569", service: "โรงแรม" });

  const day = await seedDaycare(env.base);
  await run(env.base, day.bk.id, "daycare_visit", day.entityId);
  expect((await sent(env.base, day.entityId))[0]?.payload).toMatchObject({ dateTime: "6 ต.ค. 2569 10:00 น.", service: "Daycare" });
});

it("skips cancelled bookings, cancelled visits and rescheduled visits", async () => {
  const cancelledBooking = await seedGroom(env.base, { bookingStatus: "cancelled" });
  await run(env.base, cancelledBooking.bk.id, "groom_appointment", cancelledBooking.entityId);
  const cancelledVisit = await seedGroom(env.base, { status: "cancelled" });
  await run(env.base, cancelledVisit.bk.id, "groom_appointment", cancelledVisit.entityId);
  // the appointment moved to 14:00 — the job set for 10:00 is stale
  const moved = await seedGroom(env.base, { startsAt: new Date(TOMORROW.getTime() + 4 * 3_600_000) });
  await run(env.base, moved.bk.id, "groom_appointment", moved.entityId);
  for (const { entityId } of [cancelledBooking, cancelledVisit, moved]) expect(await sent(env.base, entityId)).toHaveLength(0);
});

it("respects branch_policy.reminder_24h_enabled = false", async () => {
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, reminder24hEnabled: false });
  try {
    const { bk, entityId } = await seedGroom(env.base);
    await run(env.base, bk.id, "groom_appointment", entityId);
    expect(await sent(env.base, entityId)).toHaveLength(0);
  } finally {
    await env.db.delete(branchPolicy).where(eq(branchPolicy.branchId, env.base.branchId));
  }
});

it("never reads another organization's booking", async () => {
  const { bk, entityId } = await seedGroom(other);
  await run(env.base, bk.id, "groom_appointment", entityId);
  expect(await sent(other, entityId)).toHaveLength(0);
});
