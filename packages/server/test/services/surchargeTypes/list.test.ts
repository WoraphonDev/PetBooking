import { SurchargeTypesListRequest, SurchargeTypesListResponse } from "@app/contracts/endpoints/surchargeTypes.list";
import { branch, surchargeType } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { surchargeTypesList } from "../../../src/services/surchargeTypes/list.ts";
import { customerCtx, seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withStaff("surchargeTypes.list", { query: SurchargeTypesListRequest }, surchargeTypesList);
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(async () => {
  await env.close();
});

it.each(["owner", "front_desk", "staff"] as const)("returns exact SurchargeTypeItem fields for %s in its branch only", async (role) => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  const [second] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: `second-${role}` })
    .returning();
  const [own] = await env.db
    .insert(surchargeType)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      nameTh: role,
      defaultAmountSatang: 12345,
      status: "archived",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    })
    .returning();
  await env.db.insert(surchargeType).values([
    { organizationId: foreign.orgId, branchId: foreign.branchId, nameTh: "Foreign" },
    { organizationId: env.base.orgId, branchId: second?.id ?? "", nameTh: "Other branch" },
  ]);
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const response = await GET(
    new Request("https://petbooking.test/api/v1/staff/surcharge-types", { headers: { cookie: `sid=${login.token}` } }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  const rows = SurchargeTypesListResponse.parse(body);
  expect(rows).toContainEqual({ id: own?.id, nameTh: role, defaultAmountSatang: 12345, status: "archived" });
  expect(rows.every((row) => ["owner", "front_desk", "staff"].includes(row.nameTh))).toBe(true);
  expect(body).toEqual(rows);
});
it("rejects unsupported query fields with VALIDATION_FAILED", async () => {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const response = await GET(
    new Request("https://petbooking.test/api/v1/staff/surcharge-types?branchId=foreign", { headers: { cookie: `sid=${login.token}` } }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});
it("requires a staff session and denies customer actors", async () => {
  expect((await GET(new Request("https://petbooking.test/api/v1/staff/surcharge-types"))).status).toBe(401);
  await expect(surchargeTypesList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("returns NOT_FOUND for foreign, missing and absent branch contexts", async () => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  for (const branchId of [foreign.branchId, "00000000-0000-4000-8000-000000000000", null]) {
    await expect(surchargeTypesList({ ...staffCtx(env.base, "owner"), branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});
