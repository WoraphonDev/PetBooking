// T-0172 liff.updateMe: partial profile update, R-22 phone, photo consent → customer + consent_record.
import { LiffUpdateMeParams, LiffUpdateMeRequest, LiffUpdateMeResponse } from "@app/contracts/endpoints/liff.updateMe";
import { consentRecord, customer, ownerProfile } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffUpdateMe } from "../../../src/services/liff/updateMe.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let n = 0;
const PATCH = withCustomer("liff.updateMe", { params: LiffUpdateMeParams, body: LiffUpdateMeRequest }, liffUpdateMe);
const call = (slug: string, token: string, body: unknown) =>
  PATCH(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://petbooking.test", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug } },
  );
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
async function cid(s: SeedOrg) {
  return (
    await createSession(
      env.db,
      { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
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

it("updates the given profile fields only and returns MyProfile", async () => {
  const s = await seedOrg(env.db, "um1");
  const [before] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, s.ownerProfileId));
  const res = await call("shop-um1", await cid(s), { nickname: "มิว", phone: "081-234-5678" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(LiffUpdateMeResponse.safeParse(body).success).toBe(true);
  const [after] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, s.ownerProfileId));
  expect(after).toMatchObject({ nickname: "มิว", phoneE164: "+66812345678", firstName: before?.firstName, lastName: before?.lastName });
  expect(body).toMatchObject({ nickname: "มิว", phone: "+66812345678", firstName: before?.firstName });
  const consents = await env.db.select().from(consentRecord).where(eq(consentRecord.subjectId, s.ownerProfileId));
  expect(consents).toHaveLength(0);
});

it("email is saved lower-cased, and an empty string clears it (Q-1040)", async () => {
  const s = await seedOrg(env.db, "um7");
  const token = await cid(s);
  expect(await (await call("shop-um7", token, { email: "Mali@Example.TEST" })).json()).toMatchObject({ email: "mali@example.test" });
  const [saved] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, s.ownerProfileId));
  expect(saved?.email).toBe("mali@example.test");
  expect(await (await call("shop-um7", token, { email: "" })).json()).toMatchObject({ email: null });
});

it("photoConsent sets customer.photo_consent and inserts a consent_record", async () => {
  const s = await seedOrg(env.db, "um2");
  const token = await cid(s);
  expect(await (await call("shop-um2", token, { photoConsent: true })).json()).toMatchObject({ photoConsent: "granted" });
  expect(await (await call("shop-um2", token, { photoConsent: false })).json()).toMatchObject({ photoConsent: "denied" });
  const [cust] = await env.db.select().from(customer).where(eq(customer.id, s.customerId));
  expect(cust?.photoConsent).toBe("denied");
  expect(cust?.photoConsentAt).not.toBeNull();
  const rows = await env.db
    .select()
    .from(consentRecord)
    .where(and(eq(consentRecord.subjectId, s.ownerProfileId), eq(consentRecord.document, "photo_consent")));
  expect(rows.map((r) => r.accepted).sort()).toEqual([false, true]);
  expect(rows[0]).toMatchObject({ subjectType: "owner_profile", organizationId: s.orgId, version: "2026-10-01" });
});

it("INVALID_PHONE for a number R-22 rejects; nothing changes", async () => {
  const s = await seedOrg(env.db, "um3");
  const res = await call("shop-um3", await cid(s), { phone: "12", nickname: "x" });
  expect(await errorCode(res)).toBe("INVALID_PHONE");
  const [after] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, s.ownerProfileId));
  expect(after?.nickname).not.toBe("x");
});

it.each([[{ firstName: "" }], [{ photoConsent: "yes" }], [{ firstName: "ก".repeat(61) }], [{ email: "not-an-email" }]])(
  "VALIDATION_FAILED for %j",
  async (body) => {
    const label = `um4-${++n}`;
    const s = await seedOrg(env.db, label);
    const res = await call(`shop-${label}`, await cid(s), body);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("VALIDATION_FAILED");
  },
);

it("a session of another shop → UNAUTHENTICATED", async () => {
  const a = await seedOrg(env.db, "um5");
  await seedOrg(env.db, "um6");
  const res = await call("shop-um6", await cid(a), { nickname: "x" });
  expect(await errorCode(res)).toBe("UNAUTHENTICATED");
});
