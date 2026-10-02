import { CustomersUpdateParams, CustomersUpdateRequest, CustomersUpdateResponse } from "@app/contracts/endpoints/customers.update";
import { customer, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { customersUpdate } from "../../../src/services/customers/update.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const PATCH = withStaff("customers.update", { body: CustomersUpdateRequest, params: CustomersUpdateParams }, customersUpdate);
let env: TestEnv;
let foreign: SeedOrg;

beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db
    .update(ownerProfile)
    .set({
      firstName: "Owner a",
      lastName: "เดิม",
      nickname: "เดิม",
      phoneE164: "+66812345678",
      email: null,
      birthDate: null,
      addressLine: null,
    })
    .where(eq(ownerProfile.id, env.base.ownerProfileId));
  await env.db
    .update(customer)
    .set({
      internalNote: "เดิม",
      depositExempt: false,
      photoConsent: "unknown",
      photoConsentAt: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    })
    .where(eq(customer.id, env.base.customerId));
});

async function patch(body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk", customerId = env.base.customerId) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PATCH(
    new Request(`https://petbooking.test/api/v1/staff/customers/${customerId}`, {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ customerId }) },
  );
}
const rows = async () => {
  const [c] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  const [o] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, env.base.ownerProfileId));
  return { c, o };
};
const update = (body: Record<string, unknown>, role: "owner" | "front_desk" = "owner") =>
  customersUpdate(staffCtx(env.base, role), { ...CustomersUpdateRequest.parse(body), customerId: env.base.customerId });

it.each(["owner", "front_desk"] as const)("updates owner_profile and customer fields for %s and returns CustomerDetail", async (role) => {
  const response = await patch(
    {
      firstName: " สมชาย ",
      lastName: "ใจดี",
      nickname: "ชาย",
      phone: "089-111-2222",
      email: "somchai@example.test",
      birthDate: "1990-01-02",
      addressLine: "1/2 ซอยสุข",
      subdistrict: "คลองตัน",
      district: "คลองเตย",
      province: "กรุงเทพมหานคร",
      postalCode: "10110",
      emergencyContactName: "สมหญิง",
      emergencyContactPhone: "02-123-4567",
      internalNote: "ชอบนัดเช้า",
      photoConsent: "granted",
    },
    role,
  );
  expect(response.status).toBe(200);
  const body = CustomersUpdateResponse.parse(await response.json());
  expect(body).toMatchObject({
    id: env.base.customerId,
    firstName: "สมชาย",
    lastName: "ใจดี",
    nickname: "ชาย",
    phone: "+66891112222",
    email: "somchai@example.test",
    birthDate: "1990-01-02",
    addressLine: "1/2 ซอยสุข",
    subdistrict: "คลองตัน",
    district: "คลองเตย",
    province: "กรุงเทพมหานคร",
    postalCode: "10110",
    emergencyContactName: "สมหญิง",
    emergencyContactPhone: "+6621234567",
    internalNote: "ชอบนัดเช้า",
    photoConsent: "granted",
  });
  const { c, o } = await rows();
  expect(o).toMatchObject({ firstName: "สมชาย", phoneE164: "+66891112222", postalCode: "10110" });
  expect(c).toMatchObject({ emergencyContactPhone: "+6621234567", photoConsent: "granted" });
  expect(c?.photoConsentAt).toBeInstanceOf(Date);
});

it("changes only the fields sent; null or blank clears; photoConsent stamps ctx.now", async () => {
  await update({ nickname: null, lastName: "  ", photoConsent: "denied" });
  const { c, o } = await rows();
  expect(o).toMatchObject({ firstName: "Owner a", lastName: null, nickname: null, phoneE164: "+66812345678" });
  expect(c).toMatchObject({ internalNote: "เดิม", photoConsent: "denied", photoConsentAt: TEST_NOW, updatedAt: TEST_NOW });
  await update({ phone: null });
  expect((await rows()).o?.phoneE164).toBeNull();
  // an empty body changes nothing
  await update({});
  expect((await rows()).o).toMatchObject({ firstName: "Owner a", nickname: null });
});

it("lets the owner set depositExempt but not front_desk", async () => {
  expect((await update({ depositExempt: true })).depositExempt).toBe(true);
  const response = await patch({ depositExempt: false }, "front_desk");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect((await rows()).c?.depositExempt).toBe(true);
});

it("returns INVALID_PHONE for a number R-22 cannot normalize, without writing", async () => {
  for (const body of [{ phone: "12345" }, { emergencyContactPhone: "abc" }, { firstName: "ใหม่", phone: "081-234-567" }]) {
    const response = await patch(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_PHONE" } });
  }
  expect((await rows()).o).toMatchObject({ firstName: "Owner a", phoneE164: "+66812345678" });
});

it("rejects malformed fields with VALIDATION_FAILED", async () => {
  for (const body of [
    { firstName: "" },
    { firstName: null },
    { firstName: "ก".repeat(61) },
    { nickname: "ก".repeat(31) },
    { internalNote: "ก".repeat(2001) },
    { birthDate: "1990-02-30" },
    { depositExempt: "yes" },
    { photoConsent: "maybe" },
  ]) {
    const response = await patch(body);
    expect(response.status, JSON.stringify(body).slice(0, 40)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  const response = await patch({ firstName: "x" }, "front_desk", "not-a-uuid");
  expect(response.status).toBe(422);
});

it("denies role staff and customer actors", async () => {
  const response = await patch({ nickname: "x" }, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(customersUpdate(customerCtx(env.base), { customerId: env.base.customerId, nickname: "x" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("returns NOT_FOUND for another organization's customer without writing", async () => {
  const response = await patch({ firstName: "ยึด" }, "owner", foreign.customerId);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  const [o] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, foreign.ownerProfileId));
  expect(o?.firstName).toBe("Owner b");
});
