import {
  CustomersBlacklistParams,
  CustomersBlacklistRequest,
  CustomersBlacklistResponse,
} from "@app/contracts/endpoints/customers.blacklist";
import { auditLog, customer } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { customersBlacklist } from "../../../src/services/customers/blacklist.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("customers.blacklist", { body: CustomersBlacklistRequest, params: CustomersBlacklistParams }, customersBlacklist);
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
  await env.db.update(customer).set({ blacklisted: false, blacklistReason: null }).where(eq(customer.id, env.base.customerId));
});
async function post(body: unknown, role: "owner" | "front_desk" | "staff" = "owner", customerId = env.base.customerId) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/customers/${customerId}/blacklist`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ customerId }) },
  );
}
const row = async () => (await env.db.select().from(customer).where(eq(customer.id, env.base.customerId)))[0];

it("blacklists and unblacklists, returning CustomerDetail", async () => {
  const response = await post({ blacklisted: true, reason: " ไม่มาสองครั้ง " });
  expect(response.status).toBe(200);
  expect(CustomersBlacklistResponse.parse(await response.json())).toMatchObject({ blacklisted: true, blacklistReason: "ไม่มาสองครั้ง" });
  expect(await row()).toMatchObject({ blacklisted: true, blacklistReason: "ไม่มาสองครั้ง" });
  const lifted = await post({ blacklisted: false, reason: "คุยกันแล้ว" });
  expect(CustomersBlacklistResponse.parse(await lifted.json())).toMatchObject({ blacklisted: false, blacklistReason: null });
});

it("writes audit customer.blacklist with before/after and reason, stamped with ctx.now", async () => {
  await customersBlacklist(staffCtx(env.base, "owner"), { customerId: env.base.customerId, blacklisted: true, reason: "โกงมัดจำ" });
  expect(await env.db.select().from(auditLog)).toEqual([
    expect.objectContaining({
      organizationId: env.base.orgId,
      action: "customer.blacklist",
      actorType: "staff",
      actorId: env.base.staff.owner,
      entityType: "customer",
      entityId: env.base.customerId,
      before: { blacklisted: false, blacklistReason: null },
      after: { blacklisted: true, blacklistReason: "โกงมัดจำ" },
      reason: "โกงมัดจำ",
      createdAt: TEST_NOW,
    }),
  ]);
  expect((await row())?.updatedAt).toEqual(TEST_NOW);
});

it("returns REASON_REQUIRED without a reason of at least 3 chars, without writing", async () => {
  for (const body of [{ blacklisted: true }, { blacklisted: true, reason: "  ab " }, { blacklisted: false }]) {
    const response = await post(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "REASON_REQUIRED" } });
  }
  expect((await row())?.blacklisted).toBe(false);
  expect(await env.db.select().from(auditLog)).toEqual([]);
});

it("rejects malformed fields with VALIDATION_FAILED", async () => {
  for (const body of [{}, { blacklisted: "yes", reason: "เหตุผล" }, { blacklisted: true, reason: 5 }]) {
    const response = await post(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await post({ blacklisted: true, reason: "เหตุผล" }, "owner", "x")).status).toBe(422);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await post({ blacklisted: true, reason: "เหตุผล" }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(
    customersBlacklist(customerCtx(env.base), { customerId: env.base.customerId, blacklisted: true, reason: "เหตุผล" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's customer without writing", async () => {
  const response = await post({ blacklisted: true, reason: "เหตุผล" }, "owner", foreign.customerId);
  expect(response.status).toBe(404);
  const [c] = await env.db.select().from(customer).where(eq(customer.id, foreign.customerId));
  expect(c?.blacklisted).toBe(false);
  expect(await env.db.select().from(auditLog)).toEqual([]);
});
