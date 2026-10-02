import { CustomersCreateRequest, CustomersCreateResponse } from "@app/contracts/endpoints/customers.create";
import { customer, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { customersCreate } from "../../../src/services/customers/create.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("customers.create", { body: CustomersCreateRequest }, customersCreate);
let env: TestEnv;
let foreign: SeedOrg;

beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
  // the seeded customers of both shops use +66812345678
  for (const id of [env.base.ownerProfileId, foreign.ownerProfileId])
    await env.db.update(ownerProfile).set({ phoneE164: "+66812345678" }).where(eq(ownerProfile.id, id));
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(() => resetRateLimits());

async function post(input: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/customers", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const countCustomers = async () => (await env.db.select().from(customer).where(eq(customer.organizationId, env.base.orgId))).length;

it.each(["owner", "front_desk"] as const)("creates owner_profile + customer for %s and returns CustomerDetail", async (role) => {
  const response = await post(
    {
      firstName: " มานี ",
      lastName: "มีนา",
      nickname: "นี",
      phone: role === "owner" ? "089-111-2222" : "089-111-3333",
      email: "manee@example.test",
      sourceChannel: "phone",
      referralNote: "เห็นจากเพจ",
      internalNote: "แพ้ขนนก",
      photoConsent: "granted",
    },
    role,
  );
  expect(response.status).toBe(200);
  const body = CustomersCreateResponse.parse(await response.json());
  expect(body).toMatchObject({
    firstName: "มานี",
    lastName: "มีนา",
    nickname: "นี",
    phone: role === "owner" ? "+66891112222" : "+66891113333",
    email: "manee@example.test",
    sourceChannel: "phone",
    referralNote: "เห็นจากเพจ",
    internalNote: "แพ้ขนนก",
    photoConsent: "granted",
    reliabilityLevel: 3,
    visitCount: 0,
    creditBalanceSatang: 0,
    line: null,
    pets: [],
    activePackages: [],
    upcomingBookings: [],
  });
  expect(body).not.toHaveProperty("warnings");
  const [c] = await env.db.select().from(customer).where(eq(customer.id, body.id));
  const [o] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, body.ownerProfileId));
  expect(c).toMatchObject({
    organizationId: env.base.orgId,
    ownerProfileId: body.ownerProfileId,
    sourceChannel: "phone",
    photoConsent: "granted",
  });
  expect(o).toMatchObject({ createdInOrgId: env.base.orgId, firstName: "มานี", phoneE164: body.phone, email: "manee@example.test" });
});

it("applies defaults for omitted fields and stamps ctx.now", async () => {
  const created = await customersCreate(staffCtx(env.base, "owner"), CustomersCreateRequest.parse({ firstName: "ชูใจ", lastName: " " }));
  expect(created).toMatchObject({
    lastName: null,
    nickname: null,
    phone: null,
    email: null,
    sourceChannel: "walk_in",
    photoConsent: "unknown",
  });
  const [c] = await env.db.select().from(customer).where(eq(customer.id, created.id));
  expect(c).toMatchObject({ createdAt: TEST_NOW, updatedAt: TEST_NOW });
});

it("warns DUPLICATE_PHONE with this shop's customers that use the number, without failing", async () => {
  const response = await post({ firstName: "สมชาย 2", phone: "+66 81 234 5678" });
  expect(response.status).toBe(200);
  const body = CustomersCreateResponse.parse(await response.json());
  expect(body.phone).toBe("+66812345678");
  // the other shop's customer with the same number is not reported
  expect(body.warnings).toEqual([
    { code: "DUPLICATE_PHONE", message: "เบอร์นี้ซ้ำกับลูกค้าเดิมในร้าน", data: { duplicateCustomerIds: [env.base.customerId] } },
  ]);
});

it("returns INVALID_PHONE for a number R-22 cannot normalize, without writing", async () => {
  const before = await countCustomers();
  for (const phone of ["12345", "081-234-567", "abc"]) {
    const response = await post({ firstName: "เบอร์ผิด", phone });
    expect(response.status, phone).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_PHONE" } });
  }
  expect(await countCustomers()).toBe(before);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  const before = await countCustomers();
  for (const input of [
    {},
    { firstName: "" },
    { firstName: "   " },
    { firstName: "ก".repeat(61) },
    { firstName: "a", lastName: "ก".repeat(61) },
    { firstName: "a", nickname: "ก".repeat(31) },
    { firstName: "a", internalNote: "ก".repeat(2001) },
    { firstName: "a", sourceChannel: "facebook" },
    { firstName: "a", photoConsent: "yes" },
  ]) {
    const response = await post(input);
    expect(response.status, JSON.stringify(input).slice(0, 60)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await countCustomers()).toBe(before);
});

it("denies role staff and customer actors", async () => {
  const response = await post({ firstName: "a" }, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(customersCreate(customerCtx(env.base), CustomersCreateRequest.parse({ firstName: "a" }))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("creates in the caller's organization only", async () => {
  const created = await customersCreate(staffCtx(foreign, "owner"), CustomersCreateRequest.parse({ firstName: "ร้านบี" }));
  const [c] = await env.db.select().from(customer).where(eq(customer.id, created.id));
  expect(c?.organizationId).toBe(foreign.orgId);
  // and it cannot be read from this shop
  const { customersGet } = await import("../../../src/services/customers/get.ts");
  await expect(customersGet(staffCtx(env.base, "owner"), { customerId: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
