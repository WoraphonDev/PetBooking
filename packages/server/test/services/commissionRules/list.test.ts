import { CommissionRulesListRequest, CommissionRulesListResponse } from "@app/contracts/endpoints/commissionRules.list";
import { commissionRule, service } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { commissionRulesList } from "../../../src/services/commissionRules/list.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let serviceId: string;
const GET = withStaff("commissionRules.list", { query: CommissionRulesListRequest }, commissionRulesList);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  const [svc] = await env.db
    .insert(service)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  serviceId = svc?.id ?? "";
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(commissionRule);
  resetRateLimits();
});
async function get(query = "", role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/commission-rules${query}`, { headers: { cookie: `sid=${login.token}` } }));
}
const rule = (extra: Partial<typeof commissionRule.$inferInsert>) => ({
  organizationId: env.base.orgId,
  branchId: env.base.branchId,
  type: "percent" as const,
  value: 1000,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...extra,
});

it("lists every CommissionRuleItem field, most specific rule first (R-13 order)", async () => {
  await env.db
    .insert(commissionRule)
    .values([
      rule({ value: 500 }),
      rule({ staffUserId: env.base.staff.staff, type: "fixed", value: 5000 }),
      rule({ serviceId, value: 1500 }),
      rule({ serviceId, staffUserId: env.base.staff.staff, value: 2000 }),
    ]);
  const response = await get();
  expect(response.status).toBe(200);
  const body = CommissionRulesListResponse.parse(await response.json());
  const rows = await env.db.select().from(commissionRule);
  const byValue = new Map(rows.map((r) => [r.value, r]));
  expect(body).toEqual(
    [2000, 1500, 5000, 500].map((v) => {
      const r = byValue.get(v);
      return { id: r?.id, serviceId: r?.serviceId, staffUserId: r?.staffUserId, type: r?.type, value: r?.value };
    }),
  );
});

it("rejects unknown query parameters", async () => {
  const response = await get("?branchId=x");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await get("", role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("denies absent sessions and customer actors", async () => {
  expect((await GET(new Request("https://petbooking.test/api/v1/staff/commission-rules"))).status).toBe(401);
  await expect(commissionRulesList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch and never lists its rules", async () => {
  const foreign = await otherOrg(env.db);
  await env.db.insert(commissionRule).values(rule({ organizationId: foreign.orgId, branchId: foreign.branchId }));
  for (const branchId of [foreign.branchId, null]) {
    await expect(commissionRulesList({ ...staffCtx(env.base, "owner"), branchId }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await commissionRulesList(staffCtx(env.base, "owner"), {})).toEqual([]);
});
