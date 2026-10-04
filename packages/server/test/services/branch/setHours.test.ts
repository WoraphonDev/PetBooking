import { BranchSetHoursRequest, BranchSetHoursResponse } from "@app/contracts/endpoints/branch.setHours";
import {
  booking,
  branch,
  branchHours,
  branchPolicy,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomStation,
  pet,
  roomType,
  roomUnit,
  staffUser,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { branchSetHours } from "../../../src/services/branch/setHours.ts";
import { customerCtx, otherOrg, type SeedOrg, seedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture");
  return value;
}
let env: TestEnv;
let foreign: SeedOrg;
const input = () => ({
  hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, isClosed: false, opensAt: "09:00", closesAt: "18:00" })),
});
beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId });
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
it("replaces seven rows, returns schema-valid settings with empty warnings, and preserves another branch", async () => {
  await env.db.insert(branchHours).values({ branchId: foreign.branchId, weekday: 0, isClosed: true });
  const first = BranchSetHoursResponse.parse(await branchSetHours(staffCtx(env.base, "owner"), input()));
  expect(first.hours).toEqual(input().hours);
  expect(first.warnings).toEqual([]);
  const next = input();
  next.hours[0] = { weekday: 0, isClosed: true, opensAt: "09:00", closesAt: "18:00" };
  const result = await branchSetHours(staffCtx(env.base, "owner"), next);
  expect(result.hours).toHaveLength(7);
  expect(result.hours[0]).toEqual({ weekday: 0, isClosed: true, opensAt: null, closesAt: null });
  expect(await env.db.select().from(branchHours).where(eq(branchHours.branchId, foreign.branchId))).toHaveLength(1);
});
it.each(["front_desk", "staff"] as const)("denies %s without writing", async (role) => {
  const before = await env.db.select().from(branchHours);
  await expect(branchSetHours(staffCtx(env.base, role), input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(branchHours)).toEqual(before);
});
it("denies customers and hides foreign or missing branches", async () => {
  await expect(branchSetHours(customerCtx(env.base), input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  for (const branchId of [foreign.branchId, null])
    await expect(branchSetHours({ ...staffCtx(env.base, "owner"), branchId }, input())).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("validates exactly seven unique weekdays and actual ordered times", () => {
  for (const bad of [
    {},
    { hours: input().hours.slice(1) },
    { hours: [...input().hours, input().hours[0]] },
    { hours: input().hours.map((h) => ({ ...h, weekday: 0 })) },
    ...[
      { weekday: 7 },
      { weekday: -1 },
      { weekday: 1.5 },
      { isClosed: "yes" },
      { opensAt: undefined },
      { closesAt: undefined },
      { opensAt: "24:00" },
      { opensAt: "09:60" },
      { opensAt: "9:00" },
      { opensAt: "18:00" },
      { closesAt: "08:00" },
    ].map((change) => ({ hours: input().hours.map((h, i) => (i ? h : { ...h, ...change })) })),
  ])
    expect(BranchSetHoursRequest.safeParse(bad).success).toBe(false);
  expect(BranchSetHoursRequest.safeParse({ hours: input().hours.map((h) => ({ weekday: h.weekday, isClosed: true })) }).success).toBe(true);
});
it("rolls back replaced hours if settings serialization fails", async () => {
  const before = await env.db.select().from(branchHours).where(eq(branchHours.branchId, env.base.branchId));
  await env.db.delete(branchPolicy).where(eq(branchPolicy.branchId, env.base.branchId));
  try {
    await expect(branchSetHours(staffCtx(env.base, "owner"), input())).rejects.toThrow("Branch policy missing");
  } finally {
    await env.db.insert(branchPolicy).values({ branchId: env.base.branchId });
  }
  expect(await env.db.select().from(branchHours).where(eq(branchHours.branchId, env.base.branchId))).toEqual(before);
});
it("returns HTTP validation errors and performs a valid owner PUT", async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const PUT = withStaff("branch.setHours", { body: BranchSetHoursRequest }, branchSetHours);
  const request = (body: unknown) =>
    new Request("https://petbooking.test/api/v1/staff/branch/hours", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    });
  const invalid = await PUT(request({ hours: [] }));
  expect(invalid.status).toBe(422);
  expect(await invalid.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  const valid = await PUT(request(input()));
  expect(valid.status).toBe(200);
  expect(BranchSetHoursResponse.parse(await valid.json()).warnings).toEqual([]);
});
async function seed(org: SeedOrg) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const newPet = async () => {
    const [p] = await env.db
      .insert(pet)
      .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" })
      .returning();
    return required(p).id;
  };
  let n = 0;
  const newBooking = async () => {
    const [b] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: org.customerId,
        bookingNo: `H-${++n}`,
        channel: "walk_in",
        createdByType: "staff",
        status: "confirmed",
        policySnapshot: {},
      })
      .returning();
    return required(b).id;
  };
  const groom = async (
    s: string,
    e: string,
    status: "scheduled" | "checked_in" | "in_progress" | "done" | "no_show" | "cancelled" = "scheduled",
  ) => {
    const [station] = await env.db
      .insert(groomStation)
      .values({ ...tenant, name: `T-${n}` })
      .returning();
    const [groomer] = await env.db
      .insert(staffUser)
      .values({ organizationId: org.orgId, displayName: `G-${n}`, role: "staff", isGroomer: true })
      .returning();
    const [a] = await env.db
      .insert(groomAppointment)
      .values({
        ...tenant,
        bookingId: await newBooking(),
        petId: await newPet(),
        stationId: required(station).id,
        groomerId: required(groomer).id,
        startsAt: new Date(s),
        endsAt: new Date(e),
        blockedUntil: new Date(e),
        status,
      })
      .returning();
    return required(a).id;
  };
  const [rt] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "Room" })
    .returning();
  const hotel = async (start: string, end: string, status: "reserved" | "checked_in" | "checked_out" = "reserved") => {
    const [unit] = await env.db
      .insert(roomUnit)
      .values({ ...tenant, roomTypeId: required(rt).id, code: `R-${n}` })
      .returning();
    const [s] = await env.db
      .insert(stay)
      .values({
        ...tenant,
        bookingId: await newBooking(),
        petId: await newPet(),
        roomTypeId: required(rt).id,
        roomUnitId: required(unit).id,
        checkInDate: start,
        checkOutDate: end,
        nights: (Date.parse(end) - Date.parse(start)) / 86400000,
        nightlyPriceSatang: 0,
        roomTotalSatang: 0,
        status,
      })
      .returning();
    return required(s).id;
  };
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "Day", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
    .returning();
  const daycare = async (date: string, status: "reserved" | "checked_in" | "checked_out" = "reserved") => {
    const [d] = await env.db
      .insert(daycareVisit)
      .values({
        ...tenant,
        bookingId: await newBooking(),
        petId: await newPet(),
        sessionTypeId: required(session).id,
        visitDate: date,
        priceSatang: 0,
        status,
      })
      .returning();
    return required(d).id;
  };
  return { groom, hotel, daycare };
}
it("warns about affected unfinished items using local weekdays, full intervals, future days and exclusive hotel checkout; preserves bookings", async () => {
  const base = await seed(env.base);
  const other = await seed(foreign);
  const hit = await base.groom("2026-10-06T01:30:00Z", "2026-10-06T02:30:00Z"); // Tuesday 08:30–09:30
  const endHit = await base.groom("2026-10-06T10:30:00Z", "2026-10-06T11:30:00Z", "checked_in");
  const crossing = await base.groom("2026-10-06T16:30:00Z", "2026-10-06T17:30:00Z");
  await base.groom("2026-10-06T02:00:00Z", "2026-10-06T11:00:00Z"); // exact boundaries excluded
  await base.groom("2026-10-06T01:30:00Z", "2026-10-06T02:30:00Z", "cancelled");
  await base.groom("2026-10-06T01:30:00Z", "2026-10-06T02:30:00Z", "no_show");
  await base.groom("2026-10-06T01:30:00Z", "2026-10-06T02:30:00Z", "done");
  await base.groom("2026-10-03T01:00:00Z", "2026-10-03T02:00:00Z"); // past
  await other.groom("2026-10-06T01:30:00Z", "2026-10-06T02:30:00Z");
  const hotel = await base.hotel("2026-10-05", "2026-10-08");
  await base.hotel("2026-10-05", "2026-10-07"); // checkout Wednesday excluded
  await base.hotel("2026-10-05", "2026-10-08", "checked_out");
  const day = await base.daycare("2026-10-07");
  await base.daycare("2026-10-07", "checked_out");
  await base.daycare("2026-09-30");
  const before = {
    groom: await env.db.select().from(groomAppointment),
    hotel: await env.db.select().from(stay),
    daycare: await env.db.select().from(daycareVisit),
    bookings: await env.db.select().from(booking),
  };
  const next = input();
  required(next.hours[3]).isClosed = true;
  const result = BranchSetHoursResponse.parse(await branchSetHours(staffCtx(env.base, "owner"), next));
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toMatchObject({ code: "BRANCH_HOURS_AFFECTED", message: "มีรายการจองอยู่นอกเวลาเปิดทำการใหม่" });
  const items = required(result.warnings[0]).data.items;
  expect(items.map((i) => i.itemId)).toEqual([hotel, hit, endHit, crossing, day]);
  expect(items.find((i) => i.itemId === hit)).toMatchObject({
    module: "grooming",
    date: "2026-10-06",
    petName: "Mochi",
    customerName: "Owner a",
    startsAt: "2026-10-06T01:30:00.000Z",
  });
  expect({
    groom: await env.db.select().from(groomAppointment),
    hotel: await env.db.select().from(stay),
    daycare: await env.db.select().from(daycareVisit),
    bookings: await env.db.select().from(booking),
  }).toEqual(before);
});

it("uses branch timezone and ctx.now, includes ongoing grooming, excludes ended items and hotel nights before today", async () => {
  const org = await seedOrg(env.db, "hours-tz");
  await env.db.update(branch).set({ timezone: "Asia/Tokyo" }).where(eq(branch.id, org.branchId));
  await env.db.insert(branchPolicy).values({ branchId: org.branchId });
  const fixtures = await seed(org);
  const ongoing = await fixtures.groom("2026-10-06T00:00:00Z", "2026-10-06T01:00:00Z", "in_progress");
  await fixtures.groom("2026-10-06T00:00:00Z", "2026-10-06T00:30:00Z", "in_progress");
  const hotel = await fixtures.hotel("2026-10-04", "2026-10-07", "checked_in");
  const day = await fixtures.daycare("2026-10-06", "checked_in");
  const ctx = { ...staffCtx(org, "owner"), now: new Date("2026-10-06T00:30:00Z"), timezone: "Asia/Bangkok" };
  const next = input();
  required(next.hours[0]).isClosed = true;
  required(next.hours[2]).closesAt = "09:45";
  const result = await branchSetHours(ctx, next);
  expect(required(result.warnings[0]).data.items.map((i) => i.itemId)).toEqual([ongoing]);
  required(next.hours[2]).isClosed = true;
  const closed = await branchSetHours(ctx, next);
  expect(required(closed.warnings[0]).data.items.map((i) => i.itemId)).toEqual([hotel, ongoing, day]);
});
