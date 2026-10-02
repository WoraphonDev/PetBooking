import { ClosuresListQuery, ClosuresListResponse } from "@app/contracts/endpoints/closures.list";
import { branch, branchClosure } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { closuresList } from "../../../src/services/closures/list.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withStaff("closures.list", { query: ClosuresListQuery }, closuresList);
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
async function get(query: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/branch/closures${query}`, { headers: { cookie: `sid=${login.token}` } }));
}
const closure = (startsAt: string, endsAt: string, extra: Partial<typeof branchClosure.$inferInsert> = {}) => ({
  branchId: env.base.branchId,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...extra,
});

it.each(["owner", "front_desk", "staff"] as const)("lists every branch_closure column for %s, ordered by start", async (role) => {
  await env.db.insert(branchClosure).values([
    closure("2026-10-12T17:00:00.000Z", "2026-10-13T17:00:00.000Z", { scope: "grooming", source: "public_holiday" }),
    closure("2026-10-06T02:00:00.000Z", "2026-10-06T05:00:00.000Z", { reason: "ปิดซ่อม", createdBy: env.base.staff.owner }),
  ]);
  const response = await get("", role);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(ClosuresListResponse.safeParse(body).success).toBe(true);
  const rows = await env.db.select().from(branchClosure).orderBy(branchClosure.startsAt);
  expect(body).toEqual(
    rows.map((r) => ({
      id: r.id,
      branchId: r.branchId,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      scope: r.scope,
      source: r.source,
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
  expect(body.map((b: { scope: string }) => b.scope)).toEqual(["all", "grooming"]);
});

it("filters to closures overlapping the branch-local days from..to", async () => {
  await env.db.insert(branchClosure).values([
    closure("2026-10-04T10:00:00.000Z", "2026-10-04T17:00:00.000Z", { reason: "ends at local midnight before" }),
    closure("2026-10-04T16:00:00.000Z", "2026-10-04T18:00:00.000Z", { reason: "spans into from" }),
    closure("2026-10-06T03:00:00.000Z", "2026-10-06T04:00:00.000Z", { reason: "inside" }),
    closure("2026-10-06T17:00:00.000Z", "2026-10-07T17:00:00.000Z", { reason: "starts after to" }),
  ]);
  const body = await (await get("?from=2026-10-05&to=2026-10-06")).json();
  expect(body.map((b: { reason: string }) => b.reason)).toEqual(["spans into from", "inside"]);
  const onlyFrom = await closuresList(staffCtx(env.base, "owner"), { from: "2026-10-06" });
  expect(onlyFrom.map((b) => b.reason)).toEqual(["inside", "starts after to"]);
  const onlyTo = await closuresList(staffCtx(env.base, "owner"), { to: "2026-10-04" });
  expect(onlyTo.map((b) => b.reason)).toEqual(["ends at local midnight before", "spans into from"]);
});

it("uses the branch timezone for the day bounds", async () => {
  await env.db.update(branch).set({ timezone: "America/New_York" }).where(eq(branch.id, env.base.branchId));
  await env.db.insert(branchClosure).values(closure("2026-10-05T03:00:00.000Z", "2026-10-05T04:00:00.000Z"));
  expect(await closuresList(staffCtx(env.base, "owner"), { from: "2026-10-05" })).toHaveLength(0);
  expect(await closuresList(staffCtx(env.base, "owner"), { to: "2026-10-04" })).toHaveLength(1);
  await env.db.update(branch).set({ timezone: "Asia/Bangkok" }).where(eq(branch.id, env.base.branchId));
});

it("rejects malformed dates and an inverted range", async () => {
  for (const query of ["?from=05-10-2026", "?to=2026-02-30", "?from=2026-10-06&to=2026-10-05"]) {
    const response = await get(query);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("denies absent sessions and customer actors", async () => {
  const response = await GET(new Request("https://petbooking.test/api/v1/staff/branch/closures"));
  expect(response.status).toBe(401);
  await expect(closuresList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch and never leaks its closures", async () => {
  const foreign = await otherOrg(env.db);
  await env.db.insert(branchClosure).values(closure("2026-10-06T02:00:00.000Z", "2026-10-06T05:00:00.000Z", { branchId: foreign.branchId }));
  for (const branchId of [foreign.branchId, null]) {
    await expect(closuresList({ ...staffCtx(env.base, "owner"), branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await closuresList(staffCtx(env.base, "owner"), {})).toEqual([]);
});
