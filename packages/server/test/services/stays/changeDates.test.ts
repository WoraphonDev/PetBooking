import { StaysChangeDatesParams, StaysChangeDatesRequest, StaysChangeDatesResponse } from "@app/contracts/endpoints/stays.changeDates";
import { booking, careTask, pet, roomType, roomUnit, service, stay, stayAddon, stayIntake } from "@app/db/schema";
import { generateCareTasks } from "@app/domain/care/care-tasks";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staysChangeDates } from "../../../src/services/stays/changeDates.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("stays.changeDates", { body: StaysChangeDatesRequest, params: StaysChangeDatesParams }, staysChangeDates);
const DAY = 86_400_000;
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const types = new Map<string, string>();
const addonServices: { perDay: string; once: string } = { perDay: "", once: "" };

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) {
    const [t] = await env.db.insert(roomType).values({ organizationId: org.orgId, branchId: org.branchId, nameTh: "ห้องเล็ก" }).returning();
    types.set(org.orgId, t?.id ?? "");
  }
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [walk] = await env.db
    .insert(service)
    .values({ ...tenant, nameTh: "พาเดินเล่น", category: "bath", scope: "hotel", isAddon: true, addonPerDay: true })
    .returning();
  const [bath] = await env.db
    .insert(service)
    .values({ ...tenant, nameTh: "อาบน้ำก่อนกลับ", category: "bath", scope: "hotel", isAddon: true })
    .returning();
  addonServices.perDay = walk?.id ?? "";
  addonServices.once = bath?.id ?? "";
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function seedStay(
  opts: {
    checkIn?: string;
    checkOut?: string;
    status?: typeof stay.$inferInsert.status;
    petId?: string;
    unitId?: string;
    addons?: boolean;
  } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const checkInDate = opts.checkIn ?? "2026-10-10";
  const checkOutDate = opts.checkOut ?? "2026-10-12";
  const nights = (Date.parse(checkOutDate) - Date.parse(checkInDate)) / DAY;
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      estimatedTotalSatang: nights * 60_000 + (opts.addons ? nights * 10_000 + 5_000 : 0),
    })
    .returning();
  const petId =
    opts.petId ??
    (
      await env.db
        .insert(pet)
        .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${seq}`, species: "dog" })
        .returning()
    )[0]?.id ??
    "";
  const unitId =
    opts.unitId ??
    (
      await env.db
        .insert(roomUnit)
        .values({ ...tenant, roomTypeId: types.get(org.orgId) ?? "", code: `R${seq}` })
        .returning()
    )[0]?.id ??
    "";
  const [s] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId,
      roomTypeId: types.get(org.orgId) ?? "",
      roomUnitId: unitId,
      checkInDate,
      checkOutDate,
      nights,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: nights * 60_000,
      status: opts.status ?? "reserved",
      checkedInAt: opts.status === "checked_in" ? new Date(Date.parse(`${checkInDate}T03:00:00Z`)) : null,
    })
    .returning();
  if (opts.addons)
    await env.db.insert(stayAddon).values([
      {
        organizationId: org.orgId,
        stayId: s?.id ?? "",
        serviceId: addonServices.perDay,
        nameSnapshot: "พาเดินเล่น",
        unitPriceSatang: 10_000,
        quantity: nights,
        totalSatang: nights * 10_000,
        addedByType: "staff",
      },
      {
        organizationId: org.orgId,
        stayId: s?.id ?? "",
        serviceId: addonServices.once,
        nameSnapshot: "อาบน้ำก่อนกลับ",
        unitPriceSatang: 5_000,
        quantity: 1,
        totalSatang: 5_000,
        addedByType: "staff",
      },
    ]);
  return { id: s?.id ?? "", bookingId: bk?.id ?? "", petId, unitId };
}
const change = (id: string, body: Omit<StaysChangeDatesRequest, never>, role: "owner" | "front_desk" = "front_desk") =>
  staysChangeDates(staffCtx(env.base, role), { ...body, stayId: id });
const stayRow = async (id: string) => (await env.db.select().from(stay).where(eq(stay.id, id)))[0];

it("reserved: both dates move, nights and room total at the booked nightly price, per-day add-on follows, estimate moves", async () => {
  const s = await seedStay({ addons: true });
  const card = StaysChangeDatesResponse.parse(await change(s.id, { checkInDate: "2026-10-09", checkOutDate: "2026-10-13" }));
  expect(card).toMatchObject({ id: s.id, checkInDate: "2026-10-09", checkOutDate: "2026-10-13", nights: 4, roomTotalSatang: 240_000 });
  expect(await stayRow(s.id)).toMatchObject({
    checkInDate: "2026-10-09",
    checkOutDate: "2026-10-13",
    nights: 4,
    roomTotalSatang: 240_000,
    nightlyPriceSatang: 60_000,
  });
  const addons = await env.db.select().from(stayAddon).where(eq(stayAddon.stayId, s.id));
  expect(addons.map((a) => [a.nameSnapshot, a.quantity, a.totalSatang]).sort()).toEqual([
    ["พาเดินเล่น", 4, 40_000],
    ["อาบน้ำก่อนกลับ", 1, 5_000],
  ]);
  // 2 → 4 nights: + 120 000 room + 20 000 walks
  expect((await env.db.select().from(booking).where(eq(booking.id, s.bookingId)))[0]?.estimatedTotalSatang).toBe(145_000 + 140_000);
});

it("the room is taken on the new nights → ROOM_TAKEN; the pet stays elsewhere → PET_ALREADY_BOOKED; nothing changes", async () => {
  const s = await seedStay();
  await seedStay({ checkIn: "2026-10-13", checkOut: "2026-10-15", unitId: s.unitId });
  await expect(change(s.id, { checkOutDate: "2026-10-14" })).rejects.toMatchObject({ code: "ROOM_TAKEN" });
  const t = await seedStay();
  await seedStay({ checkIn: "2026-10-13", checkOut: "2026-10-15", petId: t.petId });
  await expect(change(t.id, { checkOutDate: "2026-10-14" })).rejects.toMatchObject({ code: "PET_ALREADY_BOOKED" });
  expect(await stayRow(t.id)).toMatchObject({ checkOutDate: "2026-10-12", nights: 2 });
});

it("checked in: a longer stay adds the missing care tasks, a shorter one deletes future pending ones", async () => {
  const s = await seedStay({ checkIn: "2026-10-04", checkOut: "2026-10-06", status: "checked_in" });
  await env.db
    .insert(stayIntake)
    .values({ organizationId: env.base.orgId, stayId: s.id, feedingTimes: ["08:00", "18:00"], walksPerDay: 1 });
  const plan = generateCareTasks({
    checkedInAt: "2026-10-04T03:00:00.000Z",
    checkOutDate: "2026-10-06",
    expectedCheckOutTime: null,
    timezone: "Asia/Bangkok",
    feedingTimes: ["08:00", "18:00"],
    medications: [],
    walksPerDay: 1,
  });
  await env.db.insert(careTask).values(
    plan.map((t) => ({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      stayId: s.id,
      ...t,
      dueAt: new Date(t.dueAt),
      // what already happened stays as it was
      status: new Date(t.dueAt) < TEST_NOW ? ("done" as const) : ("pending" as const),
    })),
  );
  const tasksOf = async () =>
    (await env.db.select().from(careTask).where(eq(careTask.stayId, s.id))).map((t) => t.dueAt.toISOString()).sort();
  const before = await tasksOf();

  await change(s.id, { checkOutDate: "2026-10-07" }, "owner");
  const longer = await tasksOf();
  const expected = generateCareTasks({
    checkedInAt: "2026-10-04T03:00:00.000Z",
    checkOutDate: "2026-10-07",
    expectedCheckOutTime: null,
    timezone: "Asia/Bangkok",
    feedingTimes: ["08:00", "18:00"],
    medications: [],
    walksPerDay: 1,
  }).map((t) => t.dueAt);
  expect(longer).toEqual([...expected].sort());
  expect(longer.length).toBeGreaterThan(before.length);

  await change(s.id, { checkOutDate: "2026-10-05" }, "owner");
  const shorter = await env.db.select().from(careTask).where(eq(careTask.stayId, s.id));
  // nothing after the new check-out (12:00 local = 05:00Z) is left, past done tasks are kept
  expect(shorter.every((t) => t.dueAt <= new Date("2026-10-05T05:00:00Z"))).toBe(true);
  expect(shorter.filter((t) => t.status === "done").length).toBe(before.filter((d) => new Date(d) < TEST_NOW).length);
});

it("check-in date of a checked-in stay, or check-out not after check-in → VALIDATION_FAILED", async () => {
  const s = await seedStay({ checkIn: "2026-10-04", checkOut: "2026-10-06", status: "checked_in" });
  await expect(change(s.id, { checkInDate: "2026-10-03", checkOutDate: "2026-10-06" })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  await expect(change((await seedStay()).id, { checkOutDate: "2026-10-10" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
});

it.each(["checked_out", "cancelled", "no_show"] as const)("a %s stay → STATUS_NOT_ALLOWED", async (status) => {
  await expect(change((await seedStay({ status })).id, { checkOutDate: "2026-10-13" })).rejects.toMatchObject({
    code: "STATUS_NOT_ALLOWED",
  });
});

async function patch(id: string, body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/stays/${id}/dates`, {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { stayId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("through HTTP: missing / bad check-out → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND; ROOM_TAKEN mapped", async () => {
  const s = await seedStay();
  expect(await codeOf(await patch(s.id, {}))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await patch(s.id, { checkOutDate: "13/10/2026" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await patch(s.id, { checkOutDate: "2026-10-13" }, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await patch((await seedStay({}, other)).id, { checkOutDate: "2026-10-13" }))).toBe("NOT_FOUND");
  await seedStay({ checkIn: "2026-10-12", checkOut: "2026-10-14", unitId: s.unitId });
  expect(await codeOf(await patch(s.id, { checkOutDate: "2026-10-13" }))).toBe("ROOM_TAKEN");
});
