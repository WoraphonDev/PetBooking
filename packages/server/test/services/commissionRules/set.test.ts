import { CommissionRulesSetRequest, CommissionRulesSetResponse } from "@app/contracts/endpoints/commissionRules.set";
import { auditLog, bill, billLine, commissionEntry, commissionRule, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { commissionRulesSet } from "../../../src/services/commissionRules/set.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreign: SeedOrg;
let serviceId: string;
let foreignServiceId: string;
const PUT = withStaff("commissionRules.set", { body: CommissionRulesSetRequest }, commissionRulesSet);
async function addService(org: SeedOrg) {
  const [svc] = await env.db
    .insert(service)
    .values({ organizationId: org.orgId, branchId: org.branchId, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  return svc?.id ?? "";
}
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
  serviceId = await addService(env.base);
  foreignServiceId = await addService(foreign);
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(commissionEntry);
  await env.db.delete(commissionRule);
  resetRateLimits();
});
async function put(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request("https://petbooking.test/api/v1/staff/commission-rules", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const owner = () => staffCtx(env.base, "owner");
// audit_log is append-only: look only at rows written after the test started
let seenAudit = new Set<string>();
const auditRows = async () => (await env.db.select().from(auditLog)).filter((r) => !seenAudit.has(r.id));
beforeEach(async () => {
  seenAudit = new Set((await env.db.select().from(auditLog)).map((r) => r.id));
});

it("stores the rule set, returns CommissionRuleItem[] and writes commission_rule.update in the same transaction", async () => {
  const rules = [
    { type: "percent", value: 1000 },
    { serviceId, staffUserId: env.base.staff.staff, type: "percent", value: 2000 },
    { staffUserId: env.base.staff.staff, type: "fixed", value: 5000 },
  ];
  const response = await put({ rules });
  expect(response.status).toBe(200);
  const body = CommissionRulesSetResponse.parse(await response.json());
  const rows = await env.db.select().from(commissionRule);
  expect(rows).toHaveLength(3);
  expect(body.map((b) => [b.serviceId, b.staffUserId, b.type, b.value])).toEqual([
    [serviceId, env.base.staff.staff, "percent", 2000],
    [null, env.base.staff.staff, "fixed", 5000],
    [null, null, "percent", 1000],
  ]);
  for (const b of body)
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ ...b, organizationId: env.base.orgId, branchId: env.base.branchId });
  const [log] = await auditRows();
  expect(log).toMatchObject({
    action: "commission_rule.update",
    entityType: "branch",
    entityId: env.base.branchId,
    actorId: env.base.staff.owner,
  });
  expect(log?.before).toEqual({ rules: [] });
  expect(log?.after).toEqual({ rules: body });
});

it("replaces the whole set, keeping ids of matching (service, staff) keys so existing commission entries are untouched", async () => {
  const [kept, dropped] = await commissionRulesSet(owner(), {
    rules: [
      { serviceId, type: "percent", value: 1500 },
      { type: "percent", value: 1000 },
    ],
  });
  const [b] = await env.db
    .insert(bill)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, openedBy: env.base.staff.owner })
    .returning();
  const [line] = await env.db
    .insert(billLine)
    .values({
      organizationId: env.base.orgId,
      billId: b?.id ?? "",
      lineType: "groom_service",
      description: "อาบน้ำ",
      unitPriceSatang: 50000,
      lineTotalSatang: 50000,
    })
    .returning();
  const entry = {
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    staffUserId: env.base.staff.staff,
    billId: b?.id ?? "",
    billLineId: line?.id ?? "",
    baseSatang: 50000,
    amountSatang: 7500,
  };
  const [e] = await env.db
    .insert(commissionEntry)
    .values({ ...entry, ruleId: kept?.id })
    .returning();

  const result = await commissionRulesSet(owner(), {
    rules: [
      { serviceId, type: "fixed", value: 8000 },
      { staffUserId: env.base.staff.staff, type: "percent", value: 1200 },
    ],
  });
  expect(result.map((r) => [r.id === kept?.id, r.serviceId, r.staffUserId, r.type, r.value])).toEqual([
    [true, serviceId, null, "fixed", 8000],
    [false, null, env.base.staff.staff, "percent", 1200],
  ]);
  expect((await env.db.select().from(commissionRule)).map((r) => r.id)).not.toContain(dropped?.id);
  const [after] = await env.db
    .select()
    .from(commissionEntry)
    .where(eq(commissionEntry.id, e?.id ?? ""));
  expect(after).toMatchObject({ ruleId: kept?.id, baseSatang: 50000, amountSatang: 7500, status: "earned" });
  const [row] = await env.db
    .select()
    .from(commissionRule)
    .where(eq(commissionRule.id, kept?.id ?? ""));
  expect(row?.updatedAt).toEqual(TEST_NOW);

  expect(await commissionRulesSet(owner(), { rules: [] })).toEqual([]);
  expect(await env.db.select().from(commissionEntry)).toHaveLength(1);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const invalid of [
    {},
    { rules: [{ value: 100 }] },
    { rules: [{ type: "bonus", value: 100 }] },
    { rules: [{ type: "percent" }] },
    { rules: [{ type: "percent", value: 10001 }] },
    { rules: [{ type: "fixed", value: -1 }] },
    { rules: [{ type: "fixed", value: 1.5 }] },
    { rules: [{ serviceId: "nope", type: "fixed", value: 100 }] },
    {
      rules: [
        { type: "fixed", value: 100 },
        { type: "percent", value: 100 },
      ],
    },
  ]) {
    const response = await put(invalid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await put({ rules: [{ type: "percent", value: 10000 }] })).status).toBe(200);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await put({ rules: [{ type: "percent", value: 1000 }] }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(await env.db.select().from(commissionRule)).toHaveLength(0);
  expect(await auditRows()).toHaveLength(0);
});

it("denies absent sessions and customer actors", async () => {
  expect((await PUT(new Request("https://petbooking.test/api/v1/staff/commission-rules", { method: "PUT" }))).status).toBe(401);
  await expect(commissionRulesSet(customerCtx(env.base), { rules: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch, service or staff user without writing", async () => {
  for (const branchId of [foreign.branchId, null]) {
    await expect(commissionRulesSet({ ...owner(), branchId }, { rules: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await expect(commissionRulesSet(owner(), { rules: [{ serviceId: foreignServiceId, type: "percent", value: 1 }] })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    commissionRulesSet(owner(), { rules: [{ staffUserId: foreign.staff.staff, type: "percent", value: 1 }] }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await env.db.select().from(commissionRule)).toHaveLength(0);
  expect(await auditRows()).toHaveLength(0);
});
