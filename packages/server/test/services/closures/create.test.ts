import { ClosuresCreateRequest, ClosuresCreateResponse } from "@app/contracts/endpoints/closures.create";
import {
  booking,
  branchClosure,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomStation,
  ownerProfile,
  pet,
  roomType,
  roomUnit,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { closuresCreate } from "../../../src/services/closures/create.ts";
import { customerCtx, otherOrg, type SeedOrg, seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const body = { startsAt: "2026-10-06T02:00:00.000Z", endsAt: "2026-10-06T05:00:00.000Z", scope: "grooming", reason: "ปิดซ่อมแอร์" } as const;
const POST = withStaff("closures.create", { body: ClosuresCreateRequest }, closuresCreate);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(branchClosure);
  resetRateLimits();
});
async function post(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/branch/closures", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}

it.each(["owner", "front_desk"] as const)("stores a manual closure for %s and returns 200 with empty affected", async (role) => {
  const response = await post(body, role);
  expect(response.status).toBe(200);
  expect(ClosuresCreateResponse.parse(await response.json())).toEqual({ affected: [] });
  const rows = await env.db.select().from(branchClosure);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    branchId: env.base.branchId,
    scope: "grooming",
    source: "manual",
    reason: "ปิดซ่อมแอร์",
    createdBy: env.base.staff[role],
  });
  expect(rows[0]?.startsAt.toISOString()).toBe(body.startsAt);
  expect(rows[0]?.endsAt.toISOString()).toBe(body.endsAt);
});

it("stores a null reason when omitted and stamps ctx.now", async () => {
  await closuresCreate(staffCtx(env.base, "owner"), { startsAt: body.startsAt, endsAt: body.endsAt, scope: "all" });
  const [row] = await env.db.select().from(branchClosure);
  expect(row).toMatchObject({ scope: "all", reason: null, createdAt: TEST_NOW, updatedAt: TEST_NOW });
});

it("rejects missing and malformed fields before writing", async () => {
  for (const invalid of [
    {},
    { ...body, startsAt: undefined },
    { ...body, endsAt: "2026-10-06" },
    { ...body, endsAt: body.startsAt },
    { ...body, endsAt: "2026-10-06T01:00:00.000Z" },
    { ...body, scope: "spa" },
    { ...body, reason: "ก".repeat(201) },
  ]) {
    const response = await post(invalid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await post({ ...body, reason: "ก".repeat(200) })).status).toBe(200);
});

it("denies the staff role, absent sessions and customer actors", async () => {
  const response = await post(body, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect((await POST(new Request("https://petbooking.test/api/v1/staff/branch/closures", { method: "POST" }))).status).toBe(401);
  await expect(closuresCreate(customerCtx(env.base), { ...body })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(branchClosure)).toHaveLength(0);
});

it("returns NOT_FOUND for another organization's branch and an absent branch", async () => {
  const foreign = await otherOrg(env.db);
  for (const branchId of [foreign.branchId, null]) {
    await expect(closuresCreate({ ...staffCtx(env.base, "owner"), branchId }, { ...body })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await env.db.select().from(branchClosure)).toHaveLength(0);
});

// ---- affected[] (Q-0028): closure 2026-10-06 09:00–12:00 Asia/Bangkok = 02:00–05:00Z, local day 2026-10-06
async function seedServices(org: SeedOrg) {
  const at = (iso: string) => new Date(iso);
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const pets = await env.db
    .insert(pet)
    .values(
      ["Mochi", "Taro", "Kuma", "Sora"].map((name) => ({
        ownerProfileId: org.ownerProfileId,
        createdInOrgId: org.orgId,
        name,
        species: "dog" as const,
      })),
    )
    .returning();
  const [p1, p2, p3, p4] = pets.map((p) => p.id) as [string, string, string, string];
  let n = 0;
  const newBooking = async () => {
    n += 1;
    const [b] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: org.customerId,
        bookingNo: `B-${String(n).padStart(3, "0")}`,
        channel: "walk_in",
        createdByType: "staff",
        status: "confirmed",
        policySnapshot: {},
      })
      .returning();
    if (!b) throw new Error("seed booking");
    return b.id;
  };
  const stations = await env.db
    .insert(groomStation)
    .values([
      { ...tenant, name: "T1" },
      { ...tenant, name: "T2" },
    ])
    .returning();
  const groom = async (
    petId: string,
    station: number,
    groomerId: string,
    s: string,
    e: string,
    status: "scheduled" | "in_progress" | "cancelled",
  ) => {
    const [row] = await env.db
      .insert(groomAppointment)
      .values({
        ...tenant,
        bookingId: await newBooking(),
        petId,
        stationId: stations[station]?.id ?? "",
        groomerId,
        startsAt: at(s),
        endsAt: at(e),
        blockedUntil: at(e),
        status,
      })
      .returning();
    return row?.id ?? "";
  };
  const g = {
    hit: await groom(p1, 0, org.staff.staff, "2026-10-06T03:00:00.000Z", "2026-10-06T04:00:00.000Z", "scheduled"),
    afterEnd: await groom(p1, 0, org.staff.staff, "2026-10-06T05:00:00.000Z", "2026-10-06T06:00:00.000Z", "scheduled"),
    beforeStart: await groom(p1, 0, org.staff.staff, "2026-10-06T01:00:00.000Z", "2026-10-06T02:00:00.000Z", "scheduled"),
    cancelled: await groom(p2, 0, org.staff.staff, "2026-10-06T04:00:00.000Z", "2026-10-06T05:00:00.000Z", "cancelled"),
    spanning: await groom(p2, 1, org.staff.owner, "2026-10-06T01:30:00.000Z", "2026-10-06T02:30:00.000Z", "in_progress"),
  };
  const [rt] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const units = await env.db
    .insert(roomUnit)
    .values(["R1", "R2", "R3"].map((code) => ({ ...tenant, roomTypeId: rt?.id ?? "", code })))
    .returning();
  const room = async (
    petId: string,
    unit: number,
    checkInDate: string,
    checkOutDate: string,
    status: "reserved" | "checked_in" | "cancelled",
  ) => {
    const [row] = await env.db
      .insert(stay)
      .values({
        ...tenant,
        bookingId: await newBooking(),
        petId,
        roomTypeId: rt?.id ?? "",
        roomUnitId: units[unit]?.id ?? "",
        checkInDate,
        checkOutDate,
        nights: (Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86_400_000,
        nightlyPriceSatang: 0,
        roomTotalSatang: 0,
        status,
      })
      .returning();
    return row?.id ?? "";
  };
  const h = {
    hit: await room(p3, 0, "2026-10-05", "2026-10-07", "reserved"),
    checkoutDay: await room(p4, 1, "2026-10-04", "2026-10-06", "checked_in"),
    cancelled: await room(p1, 2, "2026-10-06", "2026-10-08", "cancelled"),
  };
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
    .returning();
  const visit = async (petId: string, visitDate: string, status: "reserved" | "checked_out") => {
    const [row] = await env.db
      .insert(daycareVisit)
      .values({ ...tenant, bookingId: await newBooking(), petId, sessionTypeId: session?.id ?? "", visitDate, priceSatang: 0, status })
      .returning();
    return row?.id ?? "";
  };
  const d = {
    hit: await visit(p4, "2026-10-06", "reserved"),
    nextDay: await visit(p4, "2026-10-07", "reserved"),
    done: await visit(p2, "2026-10-06", "checked_out"),
  };
  return { g, h, d };
}

const closureWindow = { startsAt: "2026-10-06T02:00:00.000Z", endsAt: "2026-10-06T05:00:00.000Z" };
const itemIds = (r: { affected: { itemId: string }[] }) => r.affected.map((a) => a.itemId);

it("returns unfinished overlapping items per scope, sorted by date, startsAt (null last), bookingNo — without changing them", async () => {
  const org = await seedOrg(env.db, "affected");
  await env.db.update(ownerProfile).set({ firstName: "สมชาย", nickname: "ต้น" }).where(eq(ownerProfile.id, org.ownerProfileId));
  const { g, h, d } = await seedServices(org);
  const foreign = await seedOrg(env.db, "affected-foreign");
  await seedServices(foreign);
  const ctx = { ...staffCtx(org, "owner"), orgId: org.orgId, branchId: org.branchId };

  expect(itemIds(await closuresCreate(ctx, { ...closureWindow, scope: "grooming" }))).toEqual([g.spanning, g.hit]);
  expect(itemIds(await closuresCreate(ctx, { ...closureWindow, scope: "hotel" }))).toEqual([h.hit]);
  expect(itemIds(await closuresCreate(ctx, { ...closureWindow, scope: "daycare" }))).toEqual([d.hit]);
  const all = await closuresCreate(ctx, { ...closureWindow, scope: "all" });
  expect(ClosuresCreateResponse.safeParse(all).success).toBe(true);
  expect(itemIds(all)).toEqual([h.hit, g.spanning, g.hit, d.hit]);

  const [hotel, spanning] = all.affected;
  expect(hotel).toMatchObject({ module: "hotel", startsAt: null, date: "2026-10-05", petName: "Kuma", customerName: "สมชาย (ต้น)" });
  expect(spanning).toMatchObject({ module: "grooming", startsAt: "2026-10-06T01:30:00.000Z", date: "2026-10-06", petName: "Taro" });
  const [bookingRow] = await env.db
    .select()
    .from(booking)
    .where(eq(booking.id, spanning?.bookingId ?? ""));
  expect(spanning?.bookingNo).toBe(bookingRow?.bookingNo);
  expect(all.affected[3]).toMatchObject({ module: "daycare", startsAt: null, date: "2026-10-06", petName: "Sora" });

  // nothing is cancelled or moved automatically
  const [hitAppt] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, g.hit));
  expect(hitAppt?.status).toBe("scheduled");
});

it("uses the branch-local days for hotel nights and daycare visits and omits the nickname when absent", async () => {
  const org = await seedOrg(env.db, "affected-day");
  const { h, d } = await seedServices(org);
  const ctx = { ...staffCtx(org, "owner"), orgId: org.orgId, branchId: org.branchId };
  // 2026-10-06 23:00 → 2026-10-07 00:00 Bangkok touches only local day 2026-10-06
  const late = await closuresCreate(ctx, { startsAt: "2026-10-06T16:00:00.000Z", endsAt: "2026-10-06T17:00:00.000Z", scope: "all" });
  expect(itemIds(late)).toEqual([h.hit, d.hit]);
  expect(late.affected[0]?.customerName).toBe("Owner affected-day");
  // 2026-10-07 00:00 → 01:00 Bangkok: the stay's last night (10-06) is not touched, the 10-07 visit is
  const next = await closuresCreate(ctx, { startsAt: "2026-10-06T17:00:00.000Z", endsAt: "2026-10-06T18:00:00.000Z", scope: "all" });
  expect(itemIds(next)).toEqual([d.nextDay]);
});
