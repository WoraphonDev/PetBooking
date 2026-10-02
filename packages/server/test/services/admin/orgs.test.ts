import { AdminOrgsRequest, AdminOrgsResponse } from "@app/contracts/endpoints/admin.orgs";
import { booking, lineChannel, organization, platformAdmin, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { withAdmin } from "../../../src/http/wrap.ts";
import { adminOrgs } from "../../../src/services/admin/orgs.ts";
import { otherOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withAdmin("admin.orgs", { query: AdminOrgsRequest }, adminOrgs);
beforeEach(async () => {
  env = await setupTestDb();
});
afterEach(async () => {
  await env.close();
});
it("maps every field across shops, picks the earliest owner and latest booking, and preserves nulls", async () => {
  const second = await otherOrg(env.db);
  await env.db
    .update(staffUser)
    .set({ createdAt: new Date(0), email: null })
    .where(eq(staffUser.id, env.base.staff.owner));
  await env.db
    .insert(staffUser)
    .values({ organizationId: env.base.orgId, role: "owner", displayName: "Later", email: "later@example.test" });
  await env.db.insert(lineChannel).values({
    organizationId: second.orgId,
    branchId: second.branchId,
    providerId: "provider",
    messagingChannelId: "channel",
    channelSecretEnc: "encrypted",
    channelAccessTokenEnc: "encrypted",
    loginChannelId: "login",
    liffId: "liff",
    status: "active",
  });
  await env.db.insert(booking).values(
    [0, 1].map((i) => ({
      organizationId: second.orgId,
      branchId: second.branchId,
      customerId: second.customerId,
      bookingNo: `B${i}`,
      channel: "phone" as const,
      createdByType: "staff" as const,
      status: "confirmed" as const,
      policySnapshot: {},
      createdAt: new Date(TEST_NOW.getTime() + i),
    })),
  );
  const rows = AdminOrgsResponse.parse(await adminOrgs(makeSystemCtx(null, TEST_NOW), {}));
  const orgs = await env.db.select().from(organization);
  expect(rows.find((row) => row.id === env.base.orgId)).toEqual({
    id: env.base.orgId,
    name: "Shop a",
    slug: "shop-a",
    status: "active",
    branchName: "Shop a",
    bookingSlug: "shop-a",
    ownerEmail: null,
    lineStatus: null,
    createdAt: orgs.find((org) => org.id === env.base.orgId)?.createdAt.toISOString(),
    lastActivityAt: null,
  });
  expect(rows.find((row) => row.id === second.orgId)).toEqual({
    id: second.orgId,
    name: "Shop b",
    slug: "shop-b",
    status: "active",
    branchName: "Shop b",
    bookingSlug: "shop-b",
    ownerEmail: "owner@b.test",
    lineStatus: "active",
    createdAt: orgs.find((org) => org.id === second.orgId)?.createdAt.toISOString(),
    lastActivityAt: new Date(TEST_NOW.getTime() + 1).toISOString(),
  });
});
it("requires an active admin session and accepts administrators across organizations", async () => {
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "unused" })
    .returning();
  if (!admin) throw new Error("Missing admin");
  for (const [subjectType, subjectId] of [
    ["staff", env.base.staff.owner],
    ["customer", env.base.ownerProfileId],
    ["platform_admin", admin.id],
  ] as const) {
    const { token } = await createSession(env.db, { subjectType, subjectId }, TEST_NOW);
    const response = await GET(new Request("https://petbooking.test/api/v1/admin/organizations", { headers: { cookie: `aid=${token}` } }));
    expect(response.status).toBe(subjectType === "platform_admin" ? 200 : 401);
  }
  expect((await GET(new Request("https://petbooking.test/api/v1/admin/organizations"))).status).toBe(401);
});

it("breaks equal owner creation times by ascending UUID", async () => {
  await env.db.insert(staffUser).values([
    {
      id: "00000000-0000-4000-8000-000000000002",
      organizationId: env.base.orgId,
      role: "owner",
      displayName: "Second",
      email: "second@example.test",
      createdAt: new Date(0),
    },
    {
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: env.base.orgId,
      role: "owner",
      displayName: "First",
      email: null,
      createdAt: new Date(0),
    },
  ]);
  expect((await adminOrgs(makeSystemCtx(null, TEST_NOW), {}))[0]?.ownerEmail).toBeNull();
});
