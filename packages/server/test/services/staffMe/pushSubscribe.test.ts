// T-0105 staffMe.pushSubscribe: upsert the caller's Web Push subscription by endpoint, clearing disabled_at.
import { StaffMePushSubscribeRequest } from "@app/contracts/endpoints/staffMe.pushSubscribe";
import { webPushSubscription } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { staffMePushSubscribe } from "../../../src/services/staffMe/pushSubscribe.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
const POST = withStaff("staffMe.pushSubscribe", { body: StaffMePushSubscribeRequest }, staffMePushSubscribe);
const call = async (s: SeedOrg, staffId: string, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "staff", subjectId: staffId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/me/push-subscriptions", {
      method: "POST",
      headers: {
        origin: "https://petbooking.test",
        "content-type": "application/json",
        "user-agent": "Chrome Android",
        cookie: `sid=${token}`,
      },
      body: JSON.stringify(body),
    }),
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const sub = (endpoint: string, keys = "1") => ({ endpoint, p256dh: `p256dh-${keys}`, auth: `auth-${keys}` });
const rowsFor = (endpoint: string) => env.db.select().from(webPushSubscription).where(eq(webPushSubscription.endpoint, endpoint));

beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it.each(["owner", "front_desk", "staff"] as const)("%s registers a subscription (204)", async (role) => {
  const endpoint = `https://push.example.test/${role}`;
  const res = await call(env.base, env.base.staff[role], sub(endpoint));
  expect(res.status).toBe(204);
  expect(await rowsFor(endpoint)).toMatchObject([
    {
      organizationId: env.base.orgId,
      staffUserId: env.base.staff[role],
      p256dh: "p256dh-1",
      auth: "auth-1",
      userAgent: "Chrome Android",
      disabledAt: null,
    },
  ]);
});

it("the same endpoint again: one row, new keys and owner, disabled_at cleared", async () => {
  const endpoint = "https://push.example.test/shared-tablet";
  await call(env.base, env.base.staff.owner, sub(endpoint));
  await env.db.update(webPushSubscription).set({ disabledAt: new Date() }).where(eq(webPushSubscription.endpoint, endpoint));
  expect((await call(env.base, env.base.staff.front_desk, sub(endpoint, "2"))).status).toBe(204);
  expect(await rowsFor(endpoint)).toMatchObject([
    { staffUserId: env.base.staff.front_desk, p256dh: "p256dh-2", auth: "auth-2", disabledAt: null },
  ]);
});

it("an endpoint registered in another organization → NOT_FOUND, untouched", async () => {
  const endpoint = "https://push.example.test/other-shop";
  await call(other, other.staff.owner, sub(endpoint));
  expect(await errorCode(await call(env.base, env.base.staff.owner, sub(endpoint, "x")))).toBe("NOT_FOUND");
  expect(await rowsFor(endpoint)).toMatchObject([{ organizationId: other.orgId, p256dh: "p256dh-1" }]);
});

it("missing / non-https endpoint or keys → VALIDATION_FAILED", async () => {
  for (const body of [{}, sub("http://push.example.test/x"), sub("not a url"), { endpoint: "https://push.example.test/y", p256dh: "a" }])
    expect(await errorCode(await call(env.base, env.base.staff.owner, body))).toBe("VALIDATION_FAILED");
});
