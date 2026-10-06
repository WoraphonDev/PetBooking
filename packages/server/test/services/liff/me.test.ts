// T-0172 liff.me: the signed-in customer's MyProfile; another shop's session is refused.
import { LiffMeParams, LiffMeResponse } from "@app/contracts/endpoints/liff.me";
import { customer, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffMe } from "../../../src/services/liff/me.ts";
import { type SeedOrg, seedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withCustomer("liff.me", { params: LiffMeParams }, liffMe);
const call = (slug: string, token: string | null) =>
  GET(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/me`, {
      headers: { origin: "https://petbooking.test", ...(token ? { cookie: `cid=${encodeURIComponent(token)}` } : {}) },
    }),
    { params: { branchSlug: slug } },
  );
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
async function cid(s: SeedOrg, ownerProfileId = s.ownerProfileId) {
  return (
    await createSession(
      env.db,
      { subjectType: "customer", subjectId: ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
      new Date(),
    )
  ).token;
}

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("returns MyProfile from owner_profile + this shop's customer", async () => {
  const s = await seedOrg(env.db, "me1");
  await env.db
    .update(ownerProfile)
    .set({ lastName: "ใจดี", nickname: "เอ", email: "a@example.test" })
    .where(eq(ownerProfile.id, s.ownerProfileId));
  await env.db
    .update(customer)
    .set({ photoConsent: "granted", photoConsentAt: TEST_NOW, creditBalanceSatang: 15000 })
    .where(eq(customer.id, s.customerId));
  const res = await call("shop-me1", await cid(s));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(LiffMeResponse.safeParse(body).success).toBe(true);
  const [profile] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, s.ownerProfileId));
  expect(body).toEqual({
    firstName: profile?.firstName,
    lastName: "ใจดี",
    nickname: "เอ",
    phone: profile?.phoneE164 ?? null,
    email: "a@example.test",
    photoConsent: "granted",
    creditBalanceSatang: 15000,
  });
});

it("a session of another shop → UNAUTHENTICATED (no other customer's data)", async () => {
  const a = await seedOrg(env.db, "me2");
  await seedOrg(env.db, "me3");
  const res = await call("shop-me3", await cid(a));
  expect(res.status).toBe(401);
  expect(await errorCode(res)).toBe("UNAUTHENTICATED");
});

it("unregistered LIFF session (no customer in this shop) → NOT_REGISTERED", async () => {
  const s = await seedOrg(env.db, "me4");
  const [placeholder] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "LINE" }).returning();
  const res = await call("shop-me4", await cid(s, placeholder?.id));
  expect(await errorCode(res)).toBe("NOT_REGISTERED");
});

it("unknown branch slug → NOT_FOUND; no cookie → UNAUTHENTICATED", async () => {
  const s = await seedOrg(env.db, "me5");
  expect(await errorCode(await call("no-such-shop", await cid(s)))).toBe("NOT_FOUND");
  expect(await errorCode(await call("shop-me5", null))).toBe("UNAUTHENTICATED");
});
