import { TimeOffListQuery, TimeOffListResponse } from "@app/contracts/endpoints/timeOff.list";
import { staffTimeOff } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { timeOffList } from "../../../src/services/timeOff/list.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withStaff("timeOff.list", { query: TimeOffListQuery }, timeOffList);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(staffTimeOff);
  resetRateLimits();
});
async function get(query: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/time-off${query}`, { headers: { cookie: `sid=${login.token}` } }));
}
const timeOff = (startsAt: string, endsAt: string, extra: Partial<typeof staffTimeOff.$inferInsert> = {}) => ({
  organizationId: env.base.orgId,
  staffUserId: env.base.staff.staff,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...extra,
});
const range = "?from=2026-10-05&to=2026-10-06";

it.each(["owner", "front_desk", "staff"] as const)("lists every staff_time_off column for %s, ordered by start", async (role) => {
  await env.db
    .insert(staffTimeOff)
    .values([
      timeOff("2026-10-06T02:00:00.000Z", "2026-10-06T05:00:00.000Z", { staffUserId: env.base.staff.owner }),
      timeOff("2026-10-05T02:00:00.000Z", "2026-10-05T10:00:00.000Z", { reason: "ลาป่วย", createdBy: env.base.staff.owner }),
    ]);
  const response = await get(range, role);
  expect(response.status).toBe(200);
  const body = TimeOffListResponse.parse(await response.json());
  const rows = await env.db.select().from(staffTimeOff).orderBy(staffTimeOff.startsAt);
  expect(body).toEqual(
    rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      staffUserId: r.staffUserId,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
  expect(body.map((b) => b.reason)).toEqual(["ลาป่วย", null]);
});

it("returns only time off overlapping the local days from..to in the branch timezone", async () => {
  await env.db
    .insert(staffTimeOff)
    .values([
      timeOff("2026-10-04T10:00:00.000Z", "2026-10-04T17:00:00.000Z", { reason: "ends at local midnight before" }),
      timeOff("2026-10-04T16:00:00.000Z", "2026-10-04T18:00:00.000Z", { reason: "spans into from" }),
      timeOff("2026-10-06T03:00:00.000Z", "2026-10-06T04:00:00.000Z", { reason: "inside" }),
      timeOff("2026-10-06T17:00:00.000Z", "2026-10-07T17:00:00.000Z", { reason: "starts after to" }),
    ]);
  const body = TimeOffListResponse.parse(await (await get(range)).json());
  expect(body.map((b) => b.reason)).toEqual(["spans into from", "inside"]);
  const ny = await timeOffList({ ...staffCtx(env.base, "owner"), timezone: "America/New_York" }, { from: "2026-10-05", to: "2026-10-05" });
  // New York 2026-10-05 = 04:00Z 10-05 → 04:00Z 10-06
  expect(ny.map((b) => b.reason)).toEqual(["inside"]);
});

it("rejects missing, malformed and inverted ranges", async () => {
  for (const query of [
    "",
    "?from=2026-10-05",
    "?to=2026-10-05",
    "?from=05-10-2026&to=2026-10-06",
    "?from=2026-10-05&to=2026-02-30",
    "?from=2026-10-06&to=2026-10-05",
  ]) {
    const response = await get(query);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("denies absent sessions and customer actors", async () => {
  expect((await GET(new Request(`https://petbooking.test/api/v1/staff/time-off${range}`))).status).toBe(401);
  await expect(timeOffList(customerCtx(env.base), { from: "2026-10-05", to: "2026-10-06" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("never returns another organization's time off", async () => {
  const foreign = await otherOrg(env.db);
  await env.db
    .insert(staffTimeOff)
    .values(
      timeOff("2026-10-05T02:00:00.000Z", "2026-10-05T05:00:00.000Z", { organizationId: foreign.orgId, staffUserId: foreign.staff.staff }),
    );
  expect(TimeOffListResponse.parse(await (await get(range)).json())).toEqual([]);
  expect(await timeOffList(staffCtx(foreign, "owner"), { from: "2026-10-05", to: "2026-10-06" })).toHaveLength(1);
});
