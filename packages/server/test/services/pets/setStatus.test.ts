import { PetsSetStatusParams, PetsSetStatusRequest, PetsSetStatusResponse } from "@app/contracts/endpoints/pets.setStatus";
import {
  booking,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomStation,
  pet,
  petShopProfile,
  roomType,
  roomUnit,
  scheduledJob,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { petsSetStatus } from "../../../src/services/pets/setStatus.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("pets.setStatus", { body: PetsSetStatusRequest, params: PetsSetStatusParams }, petsSetStatus);
const HOUR = 3_600_000;
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function seedPet(org: SeedOrg = env.base) {
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
    .returning();
  await env.db.insert(petShopProfile).values({ organizationId: org.orgId, petId: p?.id ?? "" });
  return p?.id ?? "";
}
async function seedBooking(org: SeedOrg = env.base) {
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  return bk?.id ?? "";
}
/** a pending next_groom_reminder for the pet in `org` */
async function seedReminder(petId: string, org: SeedOrg = env.base) {
  await env.db.insert(scheduledJob).values({
    organizationId: org.orgId,
    jobType: "next_groom_reminder",
    runAt: new Date(TEST_NOW.getTime() + 30 * 24 * HOUR),
    payload: { petId, organizationId: org.orgId },
    dedupeKey: `next_groom:${petId}:${org.orgId}`,
  });
}
const jobOf = async (petId: string, org: SeedOrg = env.base) =>
  (
    await env.db
      .select()
      .from(scheduledJob)
      .where(eq(scheduledJob.dedupeKey, `next_groom:${petId}:${org.orgId}`))
  )[0];

it("deceased: status + status_changed_at, this shop's reminder cancelled, future bookings listed as FUTURE_BOOKINGS", async () => {
  const petId = await seedPet();
  await seedReminder(petId);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  // a groom appointment tomorrow, a reserved stay and daycare visit, and one already past
  const groomBk = await seedBooking();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "S1" })
    .returning();
  const startsAt = new Date(TEST_NOW.getTime() + 24 * HOUR);
  await env.db.insert(groomAppointment).values({
    ...tenant,
    bookingId: groomBk,
    petId,
    groomerId: env.base.staff.staff,
    stationId: st?.id ?? "",
    startsAt,
    endsAt: new Date(startsAt.getTime() + HOUR),
    blockedUntil: new Date(startsAt.getTime() + HOUR),
  });
  const pastBk = await seedBooking();
  const past = new Date(TEST_NOW.getTime() - 48 * HOUR);
  await env.db.insert(groomAppointment).values({
    ...tenant,
    bookingId: pastBk,
    petId,
    groomerId: env.base.staff.staff,
    stationId: st?.id ?? "",
    startsAt: past,
    endsAt: new Date(past.getTime() + HOUR),
    blockedUntil: new Date(past.getTime() + HOUR),
  });
  const stayBk = await seedBooking();
  const [rt] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: rt?.id ?? "", code: "R1" })
    .returning();
  await env.db.insert(stay).values({
    ...tenant,
    bookingId: stayBk,
    petId,
    roomTypeId: rt?.id ?? "",
    roomUnitId: unit?.id ?? "",
    checkInDate: "2026-10-05",
    checkOutDate: "2026-10-07",
    nights: 2,
    nightlyPriceSatang: 60_000,
    roomTotalSatang: 120_000,
  });
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db
    .insert(daycareVisit)
    .values({ ...tenant, bookingId: stayBk, petId, sessionTypeId: session?.id ?? "", visitDate: "2026-10-10", priceSatang: 30_000 });

  const res = PetsSetStatusResponse.parse(
    await petsSetStatus(staffCtx(env.base, "front_desk"), { petId, status: "deceased", note: "เสียชีวิต" }),
  );
  expect(res.status).toBe("deceased");
  expect(res.warnings).toEqual([
    { code: "FUTURE_BOOKINGS", message: "น้องยังมีใบจองที่ยังไม่ถึงวัน กรุณาตรวจสอบ", data: { bookingIds: [groomBk, stayBk] } },
  ]);
  const [row] = await env.db.select().from(pet).where(eq(pet.id, petId));
  expect(row).toMatchObject({ status: "deceased", statusChangedAt: TEST_NOW });
  expect((await jobOf(petId))?.status).toBe("cancelled");
  // nothing is cancelled automatically
  expect((await env.db.select().from(booking).where(eq(booking.id, groomBk)))[0]?.status).toBe("confirmed");
});

it("rehomed without future bookings: no warnings key; another shop's reminder for the same pet is left alone", async () => {
  const petId = await seedPet();
  await env.db.insert(petShopProfile).values({ organizationId: other.orgId, petId });
  await seedReminder(petId);
  await seedReminder(petId, other);
  const res = await petsSetStatus(staffCtx(env.base, "owner"), { petId, status: "rehomed" });
  expect(res).not.toHaveProperty("warnings");
  expect((await jobOf(petId))?.status).toBe("cancelled");
  expect((await jobOf(petId, other))?.status).toBe("pending");
});

it("back to active: status_changed_at moves, reminders untouched, no warnings", async () => {
  const petId = await seedPet();
  await env.db.update(pet).set({ status: "rehomed" }).where(eq(pet.id, petId));
  await seedReminder(petId);
  const res = await petsSetStatus(staffCtx(env.base, "owner"), { petId, status: "active" });
  expect(res).toMatchObject({ status: "active" });
  expect(res).not.toHaveProperty("warnings");
  expect((await env.db.select().from(pet).where(eq(pet.id, petId)))[0]?.statusChangedAt).toEqual(TEST_NOW);
  expect((await jobOf(petId))?.status).toBe("pending");
});

async function post(petId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/pets/${petId}/status`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { petId } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it.each([
  ["missing status", {}],
  ["unknown status", { status: "lost" }],
  ["note not a string", { status: "deceased", note: 1 }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await post(await seedPet(), body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org's pet → NOT_FOUND", async () => {
  expect(await codeOf(await post(await seedPet(), { status: "deceased" }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await post(await seedPet(other), { status: "deceased" }))).toBe("NOT_FOUND");
});
