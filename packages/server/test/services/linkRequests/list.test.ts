import { LinkRequestsListRequest, LinkRequestsListResponse } from "@app/contracts/endpoints/linkRequests.list";
import { customer, customerLinkRequest, lineIdentity, ownerProfile, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { linkRequestsList } from "../../../src/services/linkRequests/list.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("linkRequests.list", { query: LinkRequestsListRequest }, linkRequestsList);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

/** a LINE profile that registered with the phone of org's seeded customer */
async function request(org: SeedOrg, userId: string, status: "pending" | "approved" | "rejected", createdAt: string) {
  const [profile] = await env.db
    .insert(ownerProfile)
    .values({ createdInOrgId: org.orgId, firstName: `LINE ${userId}` })
    .returning();
  const [identity] = await env.db
    .insert(lineIdentity)
    .values({
      providerId: "p1",
      lineUserId: userId,
      ownerProfileId: profile?.id ?? "",
      displayName: `Line ${userId}`,
      pictureUrl: `https://pic.test/${userId}`,
    })
    .returning();
  const [row] = await env.db
    .insert(customerLinkRequest)
    .values({
      organizationId: org.orgId,
      lineIdentityId: identity?.id ?? "",
      newOwnerProfileId: profile?.id ?? "",
      candidateCustomerId: org.customerId,
      phoneEntered: "+66812345678",
      status,
      createdAt: new Date(createdAt),
    })
    .returning();
  return row?.id ?? "";
}

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  await env.db
    .update(ownerProfile)
    .set({ firstName: "Somchai", lastName: "Jaidee", nickname: "นิด", phoneE164: "+66812345678" })
    .where(eq(ownerProfile.id, env.base.ownerProfileId));
  await env.db.update(customer).set({ visitCount: 3, creditBalanceSatang: 500 }).where(eq(customer.id, env.base.customerId));
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "Mochi", species: "dog" })
    .returning();
  ids.mochi = mochi?.id ?? "";
  ids.oldRejected = await request(env.base, "U1", "rejected", "2026-10-01T00:00:00.000Z");
  ids.pendingOld = await request(env.base, "U2", "pending", "2026-10-02T00:00:00.000Z");
  ids.pendingNew = await request(env.base, "U3", "pending", "2026-10-03T00:00:00.000Z");
  ids.approved = await request(env.base, "U4", "approved", "2026-10-04T00:00:00.000Z");
  await request(foreign, "U9", "pending", "2026-10-04T00:00:00.000Z");
});
afterAll(async () => {
  await env.close();
});

async function get(qs = "", role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/link-requests${qs}`, { headers: { cookie: `sid=${login.token}` } }));
}

it.each(["owner", "front_desk"] as const)("lists every LinkRequestItem field for %s, pending first then newest", async (role) => {
  const response = await get("", role);
  expect(response.status).toBe(200);
  const body = LinkRequestsListResponse.parse(await response.json());
  expect(body.map((r) => r.id)).toEqual([ids.pendingNew, ids.pendingOld, ids.approved, ids.oldRejected]);
  expect(body[0]).toEqual({
    id: ids.pendingNew,
    lineDisplayName: "Line U3",
    linePictureUrl: "https://pic.test/U3",
    phoneEntered: "+66812345678",
    candidate: {
      id: env.base.customerId,
      firstName: "Somchai",
      lastName: "Jaidee",
      nickname: "นิด",
      phone: "+66812345678",
      pets: [{ id: ids.mochi, name: "Mochi", species: "dog" }],
      reliabilityLevel: 3,
      blacklisted: false,
      lastVisitAt: null,
      visitCount: 3,
      creditBalanceSatang: 500,
      lineLinked: false,
    },
    status: "pending",
    createdAt: "2026-10-03T00:00:00.000Z",
  });
});

it("rejects unknown query parameters with VALIDATION_FAILED", async () => {
  const response = await get("?status=pending");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies role staff and customer actors", async () => {
  const response = await get("", "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  await expect(linkRequestsList(customerCtx(env.base), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("never lists another organization's requests", async () => {
  expect(await linkRequestsList(staffCtx(env.base, "owner"), {})).toHaveLength(4);
  const fromForeign = await linkRequestsList(staffCtx(foreign, "owner"), {});
  expect(fromForeign.map((r) => r.lineDisplayName)).toEqual(["Line U9"]);
});
