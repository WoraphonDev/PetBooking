import { LinkRequestsApproveRequest, LinkRequestsApproveResponse } from "@app/contracts/endpoints/linkRequests.approve";
import {
  auditLog,
  booking,
  consentRecord,
  customer,
  customerLinkRequest,
  lineIdentity,
  notification,
  ownerProfile,
  pet,
} from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { linkRequestsApprove } from "../../../src/services/linkRequests/approve.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("linkRequests.approve", { params: LinkRequestsApproveRequest }, linkRequestsApprove);
let env: TestEnv;
let foreign: SeedOrg;
let n = 0;

async function request(org: SeedOrg, status: "pending" | "approved" | "rejected" = "pending") {
  n += 1;
  const [profile] = await env.db
    .insert(ownerProfile)
    .values({ createdInOrgId: org.orgId, firstName: `LINE ${n}` })
    .returning();
  const profileId = profile?.id ?? "";
  const [identity] = await env.db
    .insert(lineIdentity)
    .values({ providerId: "p1", lineUserId: `U${n}`, ownerProfileId: profileId, displayName: `Line ${n}` })
    .returning();
  await env.db.insert(consentRecord).values({
    subjectType: "owner_profile",
    subjectId: profileId,
    organizationId: org.orgId,
    document: "privacy_notice",
    version: "1",
    accepted: true,
  });
  const [row] = await env.db
    .insert(customerLinkRequest)
    .values({
      organizationId: org.orgId,
      lineIdentityId: identity?.id ?? "",
      newOwnerProfileId: profileId,
      candidateCustomerId: org.customerId,
      phoneEntered: "+66812345678",
      status,
    })
    .returning();
  return { requestId: row?.id ?? "", profileId, identityId: identity?.id ?? "" };
}
const profileExists = async (id: string) => (await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, id))).length > 0;
const identityOwner = async (id: string) => (await env.db.select().from(lineIdentity).where(eq(lineIdentity.id, id)))[0]?.ownerProfileId;

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
    new Request(`https://petbooking.test/api/v1/staff/link-requests/${requestId}/approve`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: Promise.resolve({ requestId }) },
  );
}

it.each(["owner", "front_desk"] as const)("approves a pending request for %s: LINE moves to the existing customer", async (role) => {
  const { requestId, profileId, identityId } = await request(env.base);
  const response = await post(requestId, role);
  expect(response.status).toBe(200);
  const body = LinkRequestsApproveResponse.parse(await response.json());
  expect(body).toMatchObject({ id: requestId, status: "approved", lineDisplayName: `Line ${n}`, candidate: { id: env.base.customerId } });
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, requestId));
  expect(row).toMatchObject({ status: "approved", decidedBy: env.base.staff[role] });
  // line_identity → the candidate's owner_profile; the emptied LINE profile is gone, its consents kept on the candidate
  expect(await identityOwner(identityId)).toBe(env.base.ownerProfileId);
  expect(await profileExists(profileId)).toBe(false);
  expect(row?.newOwnerProfileId).toBe(env.base.ownerProfileId);
  const consents = await env.db.select().from(consentRecord).where(eq(consentRecord.subjectId, env.base.ownerProfileId));
  expect(consents).toEqual(expect.arrayContaining([expect.objectContaining({ document: "privacy_notice", accepted: true })]));
  // no customer is created for the LINE profile
  expect(await env.db.select().from(customer).where(eq(customer.ownerProfileId, profileId))).toEqual([]);
});

it("writes audit customer.merge_link_approve and queues customer.link_approved in the same transaction", async () => {
  const { requestId, profileId } = await request(env.base);
  await linkRequestsApprove(staffCtx(env.base, "owner"), { requestId });
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, requestId));
  expect(row).toMatchObject({ decidedAt: TEST_NOW, updatedAt: TEST_NOW });
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, requestId));
  expect(audit).toMatchObject({
    organizationId: env.base.orgId,
    action: "customer.merge_link_approve",
    entityType: "customer_link_request",
    actorType: "staff",
    actorId: env.base.staff.owner,
    before: { status: "pending", ownerProfileId: profileId },
    after: expect.objectContaining({ status: "approved", customerId: env.base.customerId, deletedOwnerProfileId: profileId }),
  });
  const notes = await env.db
    .select()
    .from(notification)
    .where(and(eq(notification.templateKey, "customer.link_approved"), eq(notification.recipientId, env.base.customerId)));
  expect(notes.filter((x) => x.dedupeKey.startsWith(`link_approved:${requestId}:`))).toEqual([
    expect.objectContaining({
      organizationId: env.base.orgId,
      recipientType: "customer",
      recipientId: env.base.customerId,
      dedupeKey: `link_approved:${requestId}:${env.base.customerId}`,
      payload: { shopName: expect.any(String) },
    }),
  ]);
});

it("moves the pets the LINE profile created in this shop and its bookings here to the existing customer", async () => {
  const { requestId, profileId } = await request(env.base);
  const [mine] = await env.db
    .insert(pet)
    .values({ ownerProfileId: profileId, createdInOrgId: env.base.orgId, name: "Mochi", species: "dog" })
    .returning();
  const [own] = await env.db
    .insert(customer)
    .values({ organizationId: env.base.orgId, ownerProfileId: profileId, sourceChannel: "line_liff" })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: own?.id ?? "",
      bookingNo: `L-${n}`,
      channel: "line_liff",
      createdByType: "customer",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  await linkRequestsApprove(staffCtx(env.base, "owner"), { requestId });
  expect(
    (
      await env.db
        .select()
        .from(pet)
        .where(eq(pet.id, mine?.id ?? ""))
    )[0]?.ownerProfileId,
  ).toBe(env.base.ownerProfileId);
  expect(
    (
      await env.db
        .select()
        .from(booking)
        .where(eq(booking.id, bk?.id ?? ""))
    )[0]?.customerId,
  ).toBe(env.base.customerId);
  // the LINE profile still has its customer row here, so it is kept
  expect(await profileExists(profileId)).toBe(true);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, requestId));
  expect(audit?.after).toMatchObject({ petIds: [mine?.id], bookingIds: [bk?.id], deletedOwnerProfileId: null });
});

it("keeps the LINE profile, and its pets from other shops, when it is used elsewhere", async () => {
  const { requestId, profileId, identityId } = await request(env.base);
  const [theirs] = await env.db
    .insert(pet)
    .values({ ownerProfileId: profileId, createdInOrgId: foreign.orgId, name: "Kuma", species: "cat" })
    .returning();
  await linkRequestsApprove(staffCtx(env.base, "front_desk"), { requestId });
  expect(await identityOwner(identityId)).toBe(env.base.ownerProfileId);
  expect(
    (
      await env.db
        .select()
        .from(pet)
        .where(eq(pet.id, theirs?.id ?? ""))
    )[0]?.ownerProfileId,
  ).toBe(profileId);
  expect(await profileExists(profileId)).toBe(true);
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, requestId));
  expect(row?.newOwnerProfileId).toBe(profileId);
});

it("returns INVALID_TRANSITION for a request that is not pending, without side effects", async () => {
  for (const status of ["approved", "rejected"] as const) {
    const { requestId, profileId, identityId } = await request(env.base, status);
    const response = await post(requestId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_TRANSITION" } });
    expect(await identityOwner(identityId)).toBe(profileId);
    expect(await env.db.select().from(auditLog).where(eq(auditLog.entityId, requestId))).toEqual([]);
  }
});

it("rejects a malformed requestId with VALIDATION_FAILED", async () => {
  const response = await post("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies role staff and customer actors", async () => {
  const { requestId, profileId, identityId } = await request(env.base);
  const response = await post(requestId, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(linkRequestsApprove(customerCtx(env.base), { requestId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const [row] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.id, requestId));
  expect(row?.status).toBe("pending");
  expect(await identityOwner(identityId)).toBe(profileId);
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
  expect(await identityOwner(theirs.identityId)).toBe(theirs.profileId);
  expect(
    await env.db
      .select()
      .from(notification)
      .where(and(eq(notification.templateKey, "customer.link_approved"), eq(notification.organizationId, foreign.orgId))),
  ).toEqual([]);
});
