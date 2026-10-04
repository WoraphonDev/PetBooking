import { GroomMyQueueQuery, GroomMyQueueResponse } from "@app/contracts/endpoints/groom.myQueue";
import { booking, groomAppointment, groomStation, pet } from "@app/db/schema";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomMyQueue } from "../../../src/services/groom/myQueue.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("groom.myQueue", { query: GroomMyQueueQuery }, groomMyQueue);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const ids: Record<string, string> = {};

/** an appointment of `groomer` at a UTC instant */
async function seedAppt(
  org: SeedOrg,
  groomer: "staff" | "owner",
  startsAt: string,
  status: typeof groomAppointment.$inferInsert.status = "scheduled",
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `น้อง ${++seq}`, species: "dog" })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const start = new Date(startsAt);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: org.staff[groomer],
      stationId: st?.id ?? "",
      startsAt: start,
      endsAt: new Date(start.getTime() + 1_800_000),
      blockedUntil: new Date(start.getTime() + 1_800_000),
      status,
    })
    .returning();
  return a?.id ?? "";
}

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  // Bangkok 2026-10-05 = 2026-10-04T17:00Z … 2026-10-05T17:00Z
  ids.late = await seedAppt(env.base, "staff", "2026-10-05T08:00:00.000Z");
  ids.early = await seedAppt(env.base, "staff", "2026-10-05T02:00:00.000Z", "done");
  ids.midnight = await seedAppt(env.base, "staff", "2026-10-04T17:00:00.000Z");
  ids.yesterday = await seedAppt(env.base, "staff", "2026-10-04T16:30:00.000Z");
  ids.tomorrow = await seedAppt(env.base, "staff", "2026-10-05T17:00:00.000Z");
  ids.ownerAppt = await seedAppt(env.base, "owner", "2026-10-05T03:00:00.000Z");
  ids.otherOrg = await seedAppt(other, "staff", "2026-10-05T04:00:00.000Z");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

async function get(query: string, role: "owner" | "front_desk" | "staff" = "staff") {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/me/queue${query}`, { headers: { cookie: `sid=${login.token}` } }));
}

it("lists only the signed-in groomer's appointments of that branch-local day, by starts_at", async () => {
  const res = await get("?date=2026-10-05");
  expect(res.status).toBe(200);
  const body = GroomMyQueueResponse.parse(await res.json());
  expect(body.map((c) => c.id)).toEqual([ids.midnight, ids.early, ids.late]);
  expect(body[1]).toMatchObject({ status: "done", groomerName: "staff", bookingNo: expect.stringMatching(/^B6910-/) });
});

it("another groomer sees their own queue; other orgs' appointments never appear", async () => {
  const body = GroomMyQueueResponse.parse(await (await get("?date=2026-10-05", "owner")).json());
  expect(body.map((c) => c.id)).toEqual([ids.ownerAppt]);
  expect(body.map((c) => c.id)).not.toContain(ids.otherOrg);
});

it("date defaults to today in the branch timezone", async () => {
  const body = await groomMyQueue({ ...staffCtx(env.base, "staff"), now: TEST_NOW }, {});
  // TEST_NOW = 2026-10-05 10:00 Bangkok
  expect(body.map((c) => c.id)).toEqual([ids.midnight, ids.early, ids.late]);
});

it("an empty day returns []", async () => {
  expect(await (await get("?date=2026-12-25")).json()).toEqual([]);
});

it.each(["?date=2026-13-01", "?date=05-10-2026", "?date=2026-02-30"])("malformed %s → VALIDATION_FAILED", async (q) => {
  const res = await get(q);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
});
