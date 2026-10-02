import { CustomersCreditParams, CustomersCreditRequest, CustomersCreditResponse } from "@app/contracts/endpoints/customers.credit";
import { auditLog, creditLedger, customer } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { customersCredit } from "../../../src/services/customers/credit.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("customers.credit", { body: CustomersCreditRequest, params: CustomersCreditParams }, customersCredit);
let env: TestEnv;
let foreign: SeedOrg;
beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db.delete(creditLedger);
  await env.db.update(customer).set({ creditBalanceSatang: 10_000 }).where(eq(customer.id, env.base.customerId));
});
async function post(body: unknown, role: "owner" | "front_desk" | "staff" = "owner", customerId = env.base.customerId) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/customers/${customerId}/credit-adjustments`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ customerId }) },
  );
}
const balance = async () => (await env.db.select().from(customer).where(eq(customer.id, env.base.customerId)))[0]?.creditBalanceSatang;

it("adds and removes credit: ledger row + new balance, returning CustomerDetail", async () => {
  const response = await post({ deltaSatang: 5_000, reason: "ชดเชยรอนาน" });
  expect(response.status).toBe(200);
  expect(CustomersCreditResponse.parse(await response.json()).creditBalanceSatang).toBe(15_000);
  const minus = await post({ deltaSatang: -15_000, reason: "ใช้หมดแล้ว" });
  expect(CustomersCreditResponse.parse(await minus.json()).creditBalanceSatang).toBe(0);
  expect(await balance()).toBe(0);
  const ledger = await env.db.select().from(creditLedger).where(eq(creditLedger.customerId, env.base.customerId));
  expect(ledger.map((l) => [l.deltaSatang, l.reason, l.createdBy, l.organizationId]).sort()).toEqual(
    [
      [-15_000, "adjustment", env.base.staff.owner, env.base.orgId],
      [5_000, "adjustment", env.base.staff.owner, env.base.orgId],
    ].sort(),
  );
});

it("writes audit credit.adjust in the same transaction", async () => {
  await customersCredit(staffCtx(env.base, "owner"), { customerId: env.base.customerId, deltaSatang: 2_500, reason: "ของขวัญ" });
  const [entry] = await env.db.select().from(creditLedger);
  expect(entry?.createdAt).toEqual(TEST_NOW);
  expect(await env.db.select().from(auditLog)).toEqual([
    expect.objectContaining({
      action: "credit.adjust",
      entityType: "credit_ledger",
      entityId: entry?.id,
      before: { creditBalanceSatang: 10_000 },
      after: { creditBalanceSatang: 12_500 },
      reason: "ของขวัญ",
    }),
  ]);
});

it("returns INSUFFICIENT_CREDIT when the balance would go below 0, without writing", async () => {
  const response = await post({ deltaSatang: -10_001, reason: "หักเกิน" });
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "INSUFFICIENT_CREDIT" } });
  expect(await balance()).toBe(10_000);
  expect(await env.db.select().from(creditLedger)).toEqual([]);
});

it("returns REASON_REQUIRED without a reason of at least 3 chars", async () => {
  for (const body of [{ deltaSatang: 100 }, { deltaSatang: 100, reason: " ab " }]) {
    const response = await post(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "REASON_REQUIRED" } });
  }
  expect(await env.db.select().from(creditLedger)).toEqual([]);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const body of [
    {},
    { reason: "เหตุผล" },
    { deltaSatang: 0, reason: "เหตุผล" },
    { deltaSatang: 1.5, reason: "เหตุผล" },
    { deltaSatang: "100", reason: "เหตุผล" },
  ]) {
    const response = await post(body);
    expect(response.status, JSON.stringify(body)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await post({ deltaSatang: 100, reason: "เหตุผล" }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(
    customersCredit(customerCtx(env.base), { customerId: env.base.customerId, deltaSatang: 100, reason: "เหตุผล" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's customer without writing", async () => {
  const response = await post({ deltaSatang: 100, reason: "เหตุผล" }, "owner", foreign.customerId);
  expect(response.status).toBe(404);
  expect(await env.db.select().from(creditLedger)).toEqual([]);
});
