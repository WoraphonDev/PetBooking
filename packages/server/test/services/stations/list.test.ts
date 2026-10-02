import { StationsListRequest, StationsListResponse } from "@app/contracts/endpoints/stations.list";
import { branch, groomStation } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { stationsList } from "../../../src/services/stations/list.ts";
import { customerCtx, seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withStaff("stations.list", { query: StationsListRequest }, stationsList);
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(async () => {
  await env.close();
});

it.each(["owner", "front_desk", "staff"] as const)("returns all station fields for %s in its branch only", async (role) => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  const [second] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: `second-${role}` })
    .returning();
  const [own] = await env.db
    .insert(groomStation)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      name: role,
      sortOrder: 4,
      status: "archived",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    })
    .returning();
  await env.db.insert(groomStation).values([
    { organizationId: foreign.orgId, branchId: foreign.branchId, name: "Foreign" },
    { organizationId: env.base.orgId, branchId: second?.id ?? "", name: "Other branch" },
  ]);
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const response = await GET(new Request("https://petbooking.test/api/v1/staff/stations", { headers: { cookie: `sid=${login.token}` } }));
  expect(response.status).toBe(200);
  const rows = StationsListResponse.parse(await response.json());
  expect(rows).toContainEqual({ ...own, createdAt: TEST_NOW.toISOString(), updatedAt: TEST_NOW.toISOString() });
  expect(rows.every((row) => row.organizationId === env.base.orgId && row.branchId === env.base.branchId)).toBe(true);
});
it("rejects unsupported query fields with VALIDATION_FAILED", async () => {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const response = await GET(
    new Request("https://petbooking.test/api/v1/staff/stations?branchId=foreign", { headers: { cookie: `sid=${login.token}` } }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});
it("requires a staff session and denies customer actors", async () => {
  expect((await GET(new Request("https://petbooking.test/api/v1/staff/stations"))).status).toBe(401);
  await expect(stationsList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("returns NOT_FOUND for foreign, missing and absent branch contexts", async () => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  for (const branchId of [foreign.branchId, "00000000-0000-4000-8000-000000000000", null]) {
    await expect(stationsList({ ...staffCtx(env.base, "owner"), branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});
