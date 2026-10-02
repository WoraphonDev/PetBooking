import { AdminDataRequestsRequest, AdminDataRequestsResponse } from "@app/contracts/endpoints/admin.dataRequests";
import { dataRequest, organization, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits } from "../../../src/http.ts";
import { withAdmin } from "../../../src/http/wrap.ts";
import { adminDataRequests } from "../../../src/services/admin/dataRequests.ts";
import { otherOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withAdmin("admin.dataRequests", { query: AdminDataRequestsRequest }, adminDataRequests);
beforeEach(async () => {
  env = await setupTestDb();
  resetRateLimits();
});
afterEach(async () => {
  await env.close();
});
async function adminCookie() {
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "unused" })
    .returning();
  const { token } = await createSession(env.db, { subjectType: "platform_admin", subjectId: admin?.id ?? "" }, new Date());
  return `aid=${token}`;
}

it("lists PDPA requests of every shop newest first with every DataRequestItem field", async () => {
  const second = await otherOrg(env.db);
  const at = (h: number) => new Date(TEST_NOW.getTime() + h * 3_600_000);
  await env.db.insert(dataRequest).values([
    { organizationId: env.base.orgId, ownerProfileId: env.base.ownerProfileId, type: "access", createdAt: at(0), updatedAt: at(0) },
    {
      organizationId: second.orgId,
      ownerProfileId: second.ownerProfileId,
      type: "delete",
      status: "done",
      note: "ลบแล้ว",
      createdAt: at(2),
      updatedAt: at(2),
    },
    {
      organizationId: env.base.orgId,
      ownerProfileId: env.base.ownerProfileId,
      type: "delete",
      status: "rejected",
      createdAt: at(1),
      updatedAt: at(1),
    },
  ]);
  const response = await GET(
    new Request("https://petbooking.test/api/v1/admin/data-requests", { headers: { cookie: await adminCookie() } }),
  );
  expect(response.status).toBe(200);
  const body = AdminDataRequestsResponse.parse(await response.json());
  const rows = await env.db.select().from(dataRequest);
  const orgs = new Map((await env.db.select().from(organization)).map((o) => [o.id, o.name]));
  const expected = rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      orgName: orgs.get(r.organizationId),
      ownerProfileId: r.ownerProfileId,
      type: r.type,
      status: r.status,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
  expect(body).toEqual(expected);
  expect(body.map((b) => [b.orgName, b.type, b.status, b.note])).toEqual([
    ["Shop b", "delete", "done", "ลบแล้ว"],
    ["Shop a", "delete", "rejected", null],
    ["Shop a", "access", "open", null],
  ]);
});

it("returns an empty list when there are no requests", async () => {
  expect(await adminDataRequests(makeSystemCtx(null, TEST_NOW), {})).toEqual([]);
});

it("rejects unknown query parameters", async () => {
  const response = await GET(
    new Request("https://petbooking.test/api/v1/admin/data-requests?orgId=x", { headers: { cookie: await adminCookie() } }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("requires an active platform admin session", async () => {
  expect((await GET(new Request("https://petbooking.test/api/v1/admin/data-requests"))).status).toBe(401);
  const staff = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  for (const cookie of [`aid=${staff.token}`, `sid=${staff.token}`]) {
    expect((await GET(new Request("https://petbooking.test/api/v1/admin/data-requests", { headers: { cookie } }))).status).toBe(401);
  }
  const cookie = await adminCookie();
  await env.db
    .update(platformAdmin)
    .set({ status: "disabled" })
    .where(eq(platformAdmin.email, "admin@example.test"));
  expect((await GET(new Request("https://petbooking.test/api/v1/admin/data-requests", { headers: { cookie } }))).status).toBe(401);
});
