import { TimeOffCreateRequest, TimeOffCreateResponse } from "@app/contracts/endpoints/timeOff.create";
import { booking, groomAppointment, groomStation, ownerProfile, pet, staffTimeOff } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { timeOffCreate } from "../../../src/services/timeOff/create.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const POST = withStaff("timeOff.create", { body: TimeOffCreateRequest }, timeOffCreate);
let body: { staffUserId: string; startsAt: string; endsAt: string; reason?: string };
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  body = { staffUserId: env.base.staff.staff, startsAt: "2026-10-06T02:00:00.000Z", endsAt: "2026-10-06T05:00:00.000Z", reason: "ลาป่วย" };
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(staffTimeOff);
  await env.db.delete(groomAppointment);
  resetRateLimits();
});
async function post(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/time-off", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}

it.each(["owner", "front_desk"] as const)("stores the time off for %s and returns 200 with empty affected", async (role) => {
  const response = await post(body, role);
  expect(response.status).toBe(200);
  expect(TimeOffCreateResponse.parse(await response.json())).toEqual({ affected: [] });
  const rows = await env.db.select().from(staffTimeOff);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    organizationId: env.base.orgId,
    staffUserId: env.base.staff.staff,
    reason: "ลาป่วย",
    createdBy: env.base.staff[role],
  });
  expect(rows[0]?.startsAt.toISOString()).toBe(body.startsAt);
  expect(rows[0]?.endsAt.toISOString()).toBe(body.endsAt);
});

it("stores a null reason when omitted and stamps ctx.now", async () => {
  await timeOffCreate(staffCtx(env.base, "owner"), { staffUserId: body.staffUserId, startsAt: body.startsAt, endsAt: body.endsAt });
  const [row] = await env.db.select().from(staffTimeOff);
  expect(row).toMatchObject({ reason: null, createdAt: TEST_NOW, updatedAt: TEST_NOW });
});

it("rejects missing and malformed fields before writing", async () => {
  for (const invalid of [
    {},
    { ...body, staffUserId: "nope" },
    { ...body, startsAt: undefined },
    { ...body, endsAt: "2026-10-06" },
    { ...body, endsAt: body.startsAt },
    { ...body, endsAt: "2026-10-06T01:00:00.000Z" },
    { ...body, reason: 5 },
  ]) {
    const response = await post(invalid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await env.db.select().from(staffTimeOff)).toHaveLength(0);
});

it("returns the groomer's unfinished overlapping appointments in this branch sorted by start, without moving them", async () => {
  const org = env.base;
  await env.db.update(ownerProfile).set({ firstName: "สมชาย", nickname: "ต้น" }).where(eq(ownerProfile.id, org.ownerProfileId));
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p1, p2] = await env.db
    .insert(pet)
    .values(
      ["Mochi", "Taro"].map((name) => ({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name, species: "dog" as const })),
    )
    .returning();
  const [st1, st2] = await env.db
    .insert(groomStation)
    .values([
      { ...tenant, name: "T1" },
      { ...tenant, name: "T2" },
    ])
    .returning();
  let n = 0;
  const groom = async (
    petId: string,
    stationId: string,
    groomerId: string,
    s: string,
    e: string,
    status: "scheduled" | "in_progress" | "done",
  ) => {
    n += 1;
    const [b] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: org.customerId,
        bookingNo: `T-${n}`,
        channel: "walk_in",
        createdByType: "staff",
        status: "confirmed",
        policySnapshot: {},
      })
      .returning();
    const [row] = await env.db
      .insert(groomAppointment)
      .values({
        ...tenant,
        bookingId: b?.id ?? "",
        petId,
        stationId,
        groomerId,
        startsAt: new Date(s),
        endsAt: new Date(e),
        blockedUntil: new Date(e),
        status,
      })
      .returning();
    return { id: row?.id ?? "", bookingNo: b?.bookingNo ?? "" };
  };
  const g = org.staff.staff;
  const later = await groom(p1?.id ?? "", st1?.id ?? "", g, "2026-10-06T03:00:00.000Z", "2026-10-06T04:00:00.000Z", "scheduled");
  await groom(p1?.id ?? "", st1?.id ?? "", g, "2026-10-06T05:00:00.000Z", "2026-10-06T06:00:00.000Z", "scheduled"); // touches the end
  const earlier = await groom(p2?.id ?? "", st2?.id ?? "", g, "2026-10-06T01:30:00.000Z", "2026-10-06T02:30:00.000Z", "in_progress");
  await groom(p2?.id ?? "", st2?.id ?? "", g, "2026-10-06T04:00:00.000Z", "2026-10-06T05:00:00.000Z", "done"); // finished
  await groom(p1?.id ?? "", st2?.id ?? "", org.staff.owner, "2026-10-06T03:00:00.000Z", "2026-10-06T04:00:00.000Z", "scheduled"); // other groomer

  const result = await timeOffCreate(staffCtx(org, "owner"), { staffUserId: g, startsAt: body.startsAt, endsAt: body.endsAt });
  expect(TimeOffCreateResponse.safeParse(result).success).toBe(true);
  expect(result.affected).toEqual([
    {
      module: "grooming",
      bookingId: expect.any(String),
      bookingNo: earlier.bookingNo,
      itemId: earlier.id,
      petName: "Taro",
      customerName: "สมชาย (ต้น)",
      startsAt: "2026-10-06T01:30:00.000Z",
      date: "2026-10-06",
    },
    {
      module: "grooming",
      bookingId: expect.any(String),
      bookingNo: later.bookingNo,
      itemId: later.id,
      petName: "Mochi",
      customerName: "สมชาย (ต้น)",
      startsAt: "2026-10-06T03:00:00.000Z",
      date: "2026-10-06",
    },
  ]);
  const [kept] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, later.id));
  expect(kept?.status).toBe("scheduled");
});

it("denies the staff role, absent sessions and customer actors", async () => {
  const response = await post(body, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect((await POST(new Request("https://petbooking.test/api/v1/staff/time-off", { method: "POST" }))).status).toBe(401);
  await expect(timeOffCreate(customerCtx(env.base), { ...body })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(staffTimeOff)).toHaveLength(0);
});

it("returns NOT_FOUND for another organization's staff user or branch, and an absent branch", async () => {
  const foreign = await otherOrg(env.db);
  await expect(timeOffCreate(staffCtx(env.base, "owner"), { ...body, staffUserId: foreign.staff.staff })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  for (const branchId of [foreign.branchId, null]) {
    await expect(timeOffCreate({ ...staffCtx(env.base, "owner"), branchId }, { ...body })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await env.db.select().from(staffTimeOff)).toHaveLength(0);
});
