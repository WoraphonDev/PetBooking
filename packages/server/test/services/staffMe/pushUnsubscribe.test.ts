// T-0105 staffMe.pushUnsubscribe: remove the caller's subscription for an endpoint.
import { StaffMePushUnsubscribeRequest } from "@app/contracts/endpoints/staffMe.pushUnsubscribe";
import { webPushSubscription } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { staffMePushUnsubscribe } from "../../../src/services/staffMe/pushUnsubscribe.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
const DELETE = withStaff("staffMe.pushUnsubscribe", { body: StaffMePushUnsubscribeRequest }, staffMePushUnsubscribe);
const call = async (s: SeedOrg, staffId: string, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "staff", subjectId: staffId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return DELETE(
    new Request("https://petbooking.test/api/v1/staff/me/push-subscriptions", {
      method: "DELETE",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `sid=${token}` },
      body: JSON.stringify(body),
    }),
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const add = (s: SeedOrg, staffUserId: string, endpoint: string) =>
  env.db.insert(webPushSubscription).values({ organizationId: s.orgId, staffUserId, endpoint, p256dh: "p", auth: "a" });
const exists = async (endpoint: string) =>
  (await env.db.select().from(webPushSubscription).where(eq(webPushSubscription.endpoint, endpoint))).length === 1;

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

it.each(["owner", "front_desk", "staff"] as const)("%s removes their own subscription (204)", async (role) => {
  const endpoint = `https://push.example.test/u-${role}`;
  await add(env.base, env.base.staff[role], endpoint);
  expect((await call(env.base, env.base.staff[role], { endpoint })).status).toBe(204);
  expect(await exists(endpoint)).toBe(false);
});

it("a colleague's, another organization's or an unknown endpoint → NOT_FOUND, untouched", async () => {
  await add(env.base, env.base.staff.owner, "https://push.example.test/colleague");
  await add(other, other.staff.owner, "https://push.example.test/other-org");
  for (const endpoint of ["https://push.example.test/colleague", "https://push.example.test/other-org", "https://push.example.test/none"])
    expect(await errorCode(await call(env.base, env.base.staff.staff, { endpoint }))).toBe("NOT_FOUND");
  expect(await exists("https://push.example.test/colleague")).toBe(true);
  expect(await exists("https://push.example.test/other-org")).toBe(true);
});

it("missing endpoint → VALIDATION_FAILED", async () => {
  for (const body of [{}, { endpoint: "" }])
    expect(await errorCode(await call(env.base, env.base.staff.owner, body))).toBe("VALIDATION_FAILED");
});
