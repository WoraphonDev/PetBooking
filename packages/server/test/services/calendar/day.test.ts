import type { CalendarDay } from "@app/contracts/dto/calendar-day";
import { CalendarDayRequest, CalendarDayResponse } from "@app/contracts/endpoints/calendar.day";
import {
  booking,
  branchClosure,
  branchHours,
  daycareSessionType,
  daycareVisit,
  fileObject,
  groomAppointment,
  groomStation,
  ownerProfile,
  paymentSlip,
  pet,
  roomType,
  roomUnit,
  staffTimeOff,
  staffUser,
  staffWorkingHours,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { calendarDay } from "../../../src/services/calendar/day.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

// 2026-10-05 is a Monday (weekday 1); its Bangkok local day is [2026-10-04T17:00Z, 2026-10-05T17:00Z)
const GET = withStaff("calendar.day", { query: CalendarDayRequest }, calendarDay);
let env: TestEnv;
const at = (iso: string) => new Date(iso);
const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000);
type Seeded = { groomerA: string; groomerB: string; station: string; appts: Record<string, string> };
let seeded: Seeded;

async function seed(org: SeedOrg, tag: string): Promise<Seeded> {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  await env.db.update(ownerProfile).set({ phoneE164: "+66812345678" }).where(eq(ownerProfile.id, org.ownerProfileId));
  const [groomerA, groomerB] = await env.db
    .insert(staffUser)
    .values([
      { organizationId: org.orgId, email: `ga@${tag}.test`, displayName: "Dao", role: "staff", status: "active", isGroomer: true },
      { organizationId: org.orgId, email: `gb@${tag}.test`, displayName: "Fah", role: "staff", status: "active", isGroomer: true },
    ])
    .returning();
  await env.db
    .insert(staffUser)
    .values([
      { organizationId: org.orgId, email: `gx@${tag}.test`, displayName: "Gone", role: "staff", status: "disabled", isGroomer: true },
    ]);
  const a = groomerA?.id ?? "";
  const b = groomerB?.id ?? "";
  await env.db.insert(branchHours).values([
    { branchId: org.branchId, weekday: 1, opensAt: "09:00", closesAt: "18:00" },
    { branchId: org.branchId, weekday: 2, isClosed: true },
  ]);
  await env.db
    .insert(staffWorkingHours)
    .values([{ ...tenant, staffUserId: a, weekday: 1, startsAt: "09:00", endsAt: "17:00", breakStartsAt: "12:00", breakEndsAt: "13:00" }]);
  await env.db.insert(staffTimeOff).values([
    {
      organizationId: org.orgId,
      staffUserId: b,
      startsAt: at("2026-10-05T06:00:00Z"),
      endsAt: at("2026-10-05T08:00:00Z"),
      reason: "หมอฟัน",
    },
    { organizationId: org.orgId, staffUserId: b, startsAt: at("2026-10-07T02:00:00Z"), endsAt: at("2026-10-07T04:00:00Z") },
  ]);
  await env.db.insert(branchClosure).values([
    { branchId: org.branchId, startsAt: at("2026-10-05T09:00:00Z"), endsAt: at("2026-10-05T11:00:00Z"), scope: "all", reason: "ซ่อมไฟ" },
    { branchId: org.branchId, startsAt: at("2026-10-05T02:00:00Z"), endsAt: at("2026-10-05T04:00:00Z"), scope: "hotel" },
  ]);
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `โต๊ะ ${tag}` })
    .returning();
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `Mochi ${tag}`, species: "dog" })
    .returning();
  const bookings = await env.db
    .insert(booking)
    .values(
      (["confirmed", "awaiting_approval"] as const).map((status, i) => ({
        ...tenant,
        customerId: org.customerId,
        bookingNo: `${tag}-${i}`,
        channel: "walk_in" as const,
        createdByType: "staff" as const,
        status,
        policySnapshot: {},
      })),
    )
    .returning();
  const bookingId = bookings[0]?.id ?? "";
  const appt = (key: string, startsAt: string, groomerId: string, status: typeof groomAppointment.$inferInsert.status = "scheduled") => ({
    key,
    row: {
      ...tenant,
      bookingId,
      petId: mochi?.id ?? "",
      groomerId,
      stationId: station?.id ?? "",
      startsAt: at(startsAt),
      endsAt: plus(startsAt, 60),
      blockedUntil: plus(startsAt, 75),
      status,
    },
  });
  const list = [
    appt("early", "2026-10-04T17:00:00Z", a), // 00:00 local on the 5th
    appt("morning", "2026-10-05T03:00:00Z", b),
    appt("noShow", "2026-10-05T05:00:00Z", a, "no_show"),
    appt("cancelled", "2026-10-05T06:00:00Z", a, "cancelled"),
    appt("yesterday", "2026-10-04T15:00:00Z", a), // 22:00 local on the 4th
    appt("wednesday", "2026-10-07T03:00:00Z", a),
  ];
  const rows = await env.db
    .insert(groomAppointment)
    .values(list.map((x) => x.row))
    .returning();
  const appts = Object.fromEntries(list.map((x, i) => [x.key, rows[i]?.id ?? ""]));

  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: `Room ${tag}` })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: "R1" })
    .returning();
  const room = (checkInDate: string, checkOutDate: string, status: typeof stay.$inferInsert.status) => ({
    ...tenant,
    bookingId,
    petId: mochi?.id ?? "",
    roomTypeId: type?.id ?? "",
    roomUnitId: unit?.id ?? "",
    checkInDate,
    checkOutDate,
    expectedCheckInTime: "09:00",
    nights: (Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86_400_000,
    nightlyPriceSatang: 0,
    roomTotalSatang: 0,
    status,
  });
  await env.db
    .insert(stay)
    .values([
      room("2026-10-05", "2026-10-06", "reserved"),
      room("2026-10-03", "2026-10-05", "checked_in"),
      room("2026-10-05", "2026-10-08", "cancelled"),
    ]);
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: `Day ${tag}`, startsAt: "09:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db.insert(daycareVisit).values(
    (
      [
        ["2026-10-05", "reserved"],
        ["2026-10-05", "cancelled"],
        ["2026-10-06", "reserved"],
      ] as const
    ).map(([visitDate, status]) => ({
      ...tenant,
      bookingId,
      petId: mochi?.id ?? "",
      sessionTypeId: session?.id ?? "",
      visitDate,
      priceSatang: 0,
      status,
    })),
  );
  const [file] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind: "slip",
      storageKey: `k-${tag}`,
      mimeType: "image/png",
      sizeBytes: 1,
      uploadedByType: "customer",
    })
    .returning();
  await env.db.insert(paymentSlip).values(
    (["submitted", "verified"] as const).map((status) => ({
      ...tenant,
      fileId: file?.id ?? "",
      uploadedByType: "customer" as const,
      amountExpectedSatang: 1,
      status,
    })),
  );
  return { groomerA: a, groomerB: b, station: station?.id ?? "", appts };
}

beforeAll(async () => {
  env = await setupTestDb();
  seeded = await seed(env.base, "a");
  await seed(await otherOrg(env.db), "b"); // identical data in another organization must never show up
}, 60_000);
afterAll(() => env.close());
beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TEST_NOW);
});
afterEach(() => vi.useRealTimers());

async function get(role: "owner" | "front_desk" | "staff", query: string) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/calendar${query}`, { headers: { cookie: `sid=${login.token}` } }));
}

const asDay = (r: CalendarDayResponse) => r as CalendarDay;

it("returns the day's hours, groomers, stations, closures, appointments and counts", async () => {
  const response = await get("owner", "?date=2026-10-05");
  expect(response.status).toBe(200);
  const day = asDay(CalendarDayResponse.parse(await response.json()));
  expect(day).toMatchObject({
    date: "2026-10-05",
    opensAt: "09:00",
    closesAt: "18:00",
    stations: [{ id: seeded.station, name: "โต๊ะ a" }],
    hotel: { arrivals: 1, departures: 1, inHouse: 1 },
    daycare: { count: 1 },
    pendingApprovals: 1,
    pendingSlips: 1,
  });
  // active groomers only, ordered by name; working hours of Monday, time off overlapping the day
  expect(day.groomers.map((g) => [g.displayName, g.workingHours, g.timeOff.map((t) => [t.startsAt, t.reason])])).toEqual([
    ["Dao", { weekday: 1, startsAt: "09:00", endsAt: "17:00", breakStartsAt: "12:00", breakEndsAt: "13:00" }, []],
    ["Fah", null, [["2026-10-05T06:00:00.000Z", "หมอฟัน"]]],
  ]);
  // grooming closures only (scope hotel is not drawn on this calendar)
  expect(day.closures.map((c) => [c.startsAt, c.scope, c.reason])).toEqual([["2026-10-05T09:00:00.000Z", "all", "ซ่อมไฟ"]]);
  // the local day, ordered by start; cancelled left out, no_show kept
  expect(day.appointments.map((a) => a.id)).toEqual([seeded.appts.early, seeded.appts.morning, seeded.appts.noShow]);
  expect(day.appointments[0]).toMatchObject({
    groomerId: seeded.groomerA,
    groomerName: "Dao",
    stationName: "โต๊ะ a",
    customerName: "Owner a",
    customerPhone: "+66812345678",
    startsAt: "2026-10-04T17:00:00.000Z",
    blockedUntil: "2026-10-04T18:15:00.000Z",
  });
});

it("hides the customer phone from role staff but keeps every appointment", async () => {
  const response = await get("staff", "?date=2026-10-05");
  expect(response.status).toBe(200);
  const day = asDay(CalendarDayResponse.parse(await response.json()));
  expect(day.appointments).toHaveLength(3);
  expect(day.appointments.every((a) => a.customerPhone === null)).toBe(true);
  const desk = asDay(await calendarDay(staffCtx(env.base, "front_desk"), { date: "2026-10-05" }));
  expect(desk.appointments.every((a) => a.customerPhone === "+66812345678")).toBe(true);
});

it("filters groomers and appointments by groomerId", async () => {
  const day = asDay(await calendarDay(staffCtx(env.base, "owner"), { date: "2026-10-05", groomerId: seeded.groomerB }));
  expect(day.groomers.map((g) => g.id)).toEqual([seeded.groomerB]);
  expect(day.appointments.map((a) => a.id)).toEqual([seeded.appts.morning]);
});

it("returns 7 days from date for view=week", async () => {
  const response = await get("front_desk", "?date=2026-10-05&view=week");
  expect(response.status).toBe(200);
  const week = CalendarDayResponse.parse(await response.json()) as CalendarDay[];
  expect(week.map((d) => d.date)).toEqual([
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ]);
  // Tuesday is closed; Wednesday has its own appointment and time off
  expect(week[1]).toMatchObject({ opensAt: null, closesAt: null, appointments: [], hotel: { arrivals: 0, departures: 1, inHouse: 1 } });
  expect(week[1]?.daycare.count).toBe(1);
  expect(week[2]?.appointments.map((a) => a.id)).toEqual([seeded.appts.wednesday]);
  expect(week[2]?.groomers.find((g) => g.id === seeded.groomerB)?.timeOff).toHaveLength(1);
  expect(week[2]?.groomers.find((g) => g.id === seeded.groomerA)?.workingHours).toBeNull();
  // weekday without a branch_hours row → closed
  expect(week[3]).toMatchObject({ opensAt: null, closesAt: null });
});

it("rejects a missing or malformed date, an unknown view and extra parameters with VALIDATION_FAILED", async () => {
  for (const query of [
    "",
    "?date=05/10/2026",
    "?date=2026-02-30",
    "?date=2026-10-05&view=month",
    "?date=2026-10-05&groomerId=x",
    "?date=2026-10-05&foo=1",
  ]) {
    const response = await get("owner", query);
    expect(response.status, query).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("answers NOT_FOUND for a groomer of another organization or a non-groomer", async () => {
  const foreign = (await env.db.select().from(staffUser)).find((s) => s.organizationId !== env.base.orgId && s.isGroomer)?.id ?? "";
  for (const groomerId of [foreign, env.base.staff.owner]) {
    await expect(calendarDay(staffCtx(env.base, "owner"), { date: "2026-10-05", groomerId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});

it("answers NOT_FOUND when the session branch belongs to another organization", async () => {
  const foreignBranch = (await env.db.select().from(groomStation)).find((s) => s.organizationId !== env.base.orgId)?.branchId ?? "";
  await expect(calendarDay({ ...staffCtx(env.base, "owner"), branchId: foreignBranch }, { date: "2026-10-05" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
