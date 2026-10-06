// T-0181 liff.dataRequest: a PDPA access/delete request → data_request (open) + admin.data_request email.
import { LiffDataRequestParams, LiffDataRequestRequest } from "@app/contracts/endpoints/liff.dataRequest";
import { dataRequest, notification, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffDataRequest } from "../../../src/services/liff/dataRequest.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const POST = withCustomer("liff.dataRequest", { params: LiffDataRequestParams, body: LiffDataRequestRequest }, liffDataRequest);
const call = async (slug: string, s: SeedOrg, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/data-requests`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("stores an open request for the customer's owner profile and emails each active platform admin", async () => {
  const [ops, old] = await env.db
    .insert(platformAdmin)
    .values([
      { email: "ops@dr.test", displayName: "Ops", passwordHash: "test-only" },
      { email: "old@dr.test", displayName: "Old", passwordHash: "test-only", status: "disabled" },
    ])
    .returning();
  const s = await seedOrg(env.db, "dr1");
  const res = await call("shop-dr1", s, { type: "delete" });
  expect(res.status).toBe(204);
  expect(await res.text()).toBe("");
  const rows = await env.db.select().from(dataRequest).where(eq(dataRequest.organizationId, s.orgId));
  expect(rows).toMatchObject([{ ownerProfileId: s.ownerProfileId, type: "delete", status: "open", resolvedAt: null }]);
  const sent = await env.db.select().from(notification).where(eq(notification.templateKey, "admin.data_request"));
  expect(sent).toMatchObject([
    {
      organizationId: s.orgId,
      recipientType: "platform_admin",
      recipientId: ops?.id,
      payload: { type: "ขอลบข้อมูล" },
      dedupeKey: `data_request:${rows[0]?.id}:${ops?.id}`,
    },
  ]);
  expect(sent.some((n) => n.recipientId === old?.id)).toBe(false);
});

it("missing / unknown type → VALIDATION_FAILED", async () => {
  const s = await seedOrg(env.db, "dr2");
  for (const body of [{}, { type: "export" }, { type: "access", note: "x" }])
    expect(await errorCode(await call("shop-dr2", s, body))).toBe("VALIDATION_FAILED");
  expect(await env.db.select().from(dataRequest).where(eq(dataRequest.organizationId, s.orgId))).toEqual([]);
});

it("another shop's session → UNAUTHENTICATED; unknown shop → NOT_FOUND", async () => {
  const s = await seedOrg(env.db, "dr3");
  await seedOrg(env.db, "dr4");
  expect(await errorCode(await call("shop-dr4", s, { type: "access" }))).toBe("UNAUTHENTICATED");
  expect(await errorCode(await call("no-such-shop", s, { type: "access" }))).toBe("NOT_FOUND");
});
