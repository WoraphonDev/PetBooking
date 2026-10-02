import {
  CustomersReliabilityOverrideParams,
  CustomersReliabilityOverrideRequest,
  CustomersReliabilityOverrideResponse,
} from "@app/contracts/endpoints/customers.reliabilityOverride";
import { auditLog, customer } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { customersReliabilityOverride } from "../../../src/services/customers/reliabilityOverride.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const PUT = withStaff(
  "customers.reliabilityOverride",
  { body: CustomersReliabilityOverrideRequest, params: CustomersReliabilityOverrideParams },
  customersReliabilityOverride,
);
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
  await env.db.update(customer).set({ reliabilityLevel: 3, reliabilityOverride: null }).where(eq(customer.id, env.base.customerId));
});
async function put(body: unknown, role: "owner" | "front_desk" | "staff" = "owner", customerId = env.base.customerId) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request(`https://petbooking.test/api/v1/staff/customers/${customerId}/reliability-override`, {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ customerId }) },
  );
}
const row = async () => (await env.db.select().from(customer).where(eq(customer.id, env.base.customerId)))[0];

it("sets and clears the override, returning CustomerDetail", async () => {
  const response = await put({ level: 1, reason: "ลูกค้าประจำ" });
  expect(response.status).toBe(200);
  expect(CustomersReliabilityOverrideResponse.parse(await response.json())).toMatchObject({ reliabilityLevel: 3, reliabilityOverride: 1 });
  expect((await row())?.reliabilityOverride).toBe(1);
  for (const body of [{ level: null, reason: "ใช้ค่าคำนวณ" }, { reason: "ใช้ค่าคำนวณ" }]) {
    await put({ level: 4, reason: "ตั้งก่อน" });
    const cleared = await put(body);
    expect(CustomersReliabilityOverrideResponse.parse(await cleared.json()).reliabilityOverride).toBeNull();
  }
});

it("writes audit customer.reliability_override in the same transaction", async () => {
  await customersReliabilityOverride(staffCtx(env.base, "owner"), { customerId: env.base.customerId, level: 2, reason: "ยกเลิกบ่อย" });
  expect(await env.db.select().from(auditLog)).toEqual([
    expect.objectContaining({
      action: "customer.reliability_override",
      entityType: "customer",
      entityId: env.base.customerId,
      before: { reliabilityOverride: null },
      after: { reliabilityOverride: 2 },
      reason: "ยกเลิกบ่อย",
      createdAt: TEST_NOW,
    }),
  ]);
});

it("rejects missing and malformed fields with VALIDATION_FAILED, without writing", async () => {
  for (const body of [
    {},
    { level: 1 },
    { level: 1, reason: "ab" },
    { level: 0, reason: "เหตุผล" },
    { level: 5, reason: "เหตุผล" },
    { level: 1.5, reason: "เหตุผล" },
  ]) {
    const response = await put(body);
    expect(response.status, JSON.stringify(body)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await row())?.reliabilityOverride).toBeNull();
  expect(await env.db.select().from(auditLog)).toEqual([]);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await put({ level: 1, reason: "เหตุผล" }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(
    customersReliabilityOverride(customerCtx(env.base), { customerId: env.base.customerId, level: 1, reason: "เหตุผล" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's customer", async () => {
  const response = await put({ level: 1, reason: "เหตุผล" }, "owner", foreign.customerId);
  expect(response.status).toBe(404);
  expect(await env.db.select().from(auditLog)).toEqual([]);
});
