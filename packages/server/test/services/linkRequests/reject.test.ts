import { LinkRequestsRejectRequest, LinkRequestsRejectResponse } from "@app/contracts/endpoints/linkRequests.reject";
import { consentRecord, customer, customerLinkRequest, lineIdentity, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { linkRequestsReject } from "../../../src/services/linkRequests/reject.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("linkRequests.reject", { params: LinkRequestsRejectRequest }, linkRequestsReject);
let env: TestEnv;
let foreign: SeedOrg;
let n = 0;

async function request(org: SeedOrg, status: "pending" | "approved" | "rejected" = "pending", photoConsent?: boolean) {
  n += 1;
  const [profile] = await env.db
    .insert(ownerProfile)
    .values({ createdInOrgId: org.orgId, firstName: `LINE ${n}` })
    .returning();
  const [identity] = await env.db
    .insert(lineIdentity)
    .values({ providerId: "p1", lineUserId: `U${n}`, ownerProfileId: profile?.id ?? "", displayName: `Line ${n}` })
    .returning();
  if (photoConsent !== undefined)
    await env.db.insert(consentRecord).values({
      subjectType: "owner_profile",
      subjectId: profile?.id ?? "",
      organizationId: org.orgId,
      document: "photo_consent",
      version: "1",
      accepted: photoConsent,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    });
  const [row] = await env.db
    .insert(customerLinkRequest)
    .values({
      organizationId: org.orgId,
      lineIdentityId: identity?.id ?? "",
      newOwnerProfileId: profile?.id ?? "",
      candidateCustomerId: org.customerId,
      phoneEntered: "+66812345678",
      status,
    })
    .returning();
  return { requestId: row?.id ?? "", profileId: profile?.id ?? "" };
}
const customersOf = (profileId: string) => env.db.select().from(customer).where(eq(customer.ownerProfileId, profileId));

beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(() => resetRateLimits());

async function post(requestId: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/link-requests/${requestId}/reject`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: Promise.resolve({ requestId }) },
  );
}

it.each(["owner", "front_desk"] as const)("rejects a pending request for %s and returns the LinkRequestItem", async (role) => {
  const { requestId, profileId } = await request(env.base, "pending", true);
  const response = await post(requestId, role);
  expect(response.status).toBe(200);
  const body = LinkRequestsRejectResponse.parse(await response.json());
  expect(body).toMatchObject({ id: requestId, status: "rejected", lineDisplayName: `Line ${n}`, candidate: { id: env.base.customerId } });
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, requestId));
  expect(row).toMatchObject({ status: "rejected", decidedBy: env.base.staff[role] });
  // the LINE profile is now its own customer of the shop; the candidate is untouched
  expect(await customersOf(profileId)).toEqual([
    expect.objectContaining({ organizationId: env.base.orgId, sourceChannel: "line_liff", photoConsent: "granted" }),
  ]);
  const [identity] = await env.db.select().from(lineIdentity).where(eq(lineIdentity.ownerProfileId, profileId));
  expect(identity).toBeDefined();
});

it("stamps ctx.now and carries a denied / missing photo consent", async () => {
  const denied = await request(env.base, "pending", false);
  await linkRequestsReject(staffCtx(env.base, "owner"), { requestId: denied.requestId });
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, denied.requestId));
  expect(row).toMatchObject({ decidedAt: TEST_NOW, updatedAt: TEST_NOW });
  expect(await customersOf(denied.profileId)).toEqual([
    expect.objectContaining({ photoConsent: "denied", photoConsentAt: new Date("2026-10-01T00:00:00.000Z"), createdAt: TEST_NOW }),
  ]);
  const none = await request(env.base);
  await linkRequestsReject(staffCtx(env.base, "owner"), { requestId: none.requestId });
  expect(await customersOf(none.profileId)).toEqual([expect.objectContaining({ photoConsent: "unknown", photoConsentAt: null })]);
});

it("does not create a second customer when the profile already is one", async () => {
  const { requestId, profileId } = await request(env.base);
  await env.db.insert(customer).values({ organizationId: env.base.orgId, ownerProfileId: profileId, sourceChannel: "walk_in" });
  await linkRequestsReject(staffCtx(env.base, "owner"), { requestId });
  expect(await customersOf(profileId)).toEqual([expect.objectContaining({ sourceChannel: "walk_in" })]);
});

it("returns INVALID_TRANSITION for a request that is not pending, without side effects", async () => {
  for (const status of ["approved", "rejected"] as const) {
    const { requestId, profileId } = await request(env.base, status);
    const response = await post(requestId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_TRANSITION" } });
    expect(await customersOf(profileId)).toEqual([]);
  }
});

it("rejects a malformed requestId with VALIDATION_FAILED", async () => {
  const response = await post("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies role staff and customer actors", async () => {
  const { requestId } = await request(env.base);
  const response = await post(requestId, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(linkRequestsReject(customerCtx(env.base), { requestId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, requestId));
  expect(row?.status).toBe("pending");
});

it("returns NOT_FOUND for another organization's request or an unknown id", async () => {
  const theirs = await request(foreign);
  for (const requestId of [theirs.requestId, "00000000-0000-4000-8000-000000000000"]) {
    const response = await post(requestId);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  }
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, theirs.requestId));
  expect(row?.status).toBe("pending");
  expect(await env.db.select().from(customer).where(eq(customer.ownerProfileId, theirs.profileId))).toEqual([]);
});
