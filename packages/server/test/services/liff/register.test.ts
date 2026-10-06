// T-0171 liff.register: fill the LINE placeholder profile, consents ×3, then a customer or (same phone) a link request.
import { LiffRegisterParams, LiffRegisterRequest, LiffRegisterResponse } from "@app/contracts/endpoints/liff.register";
import { consentRecord, customer, customerLinkRequest, lineChannel, lineIdentity, notification, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffRegister } from "../../../src/services/liff/register.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const POST = withCustomer("liff.register", { params: LiffRegisterParams, body: LiffRegisterRequest }, liffRegister);
const VALID = {
  firstName: "มะลิ",
  lastName: "ใจดี",
  nickname: "ลิลี่",
  phone: "081-234-5678",
  privacyVersion: "2026-10-01",
  termsVersion: "2026-10-01",
  photoConsent: true,
};

/** a shop with an active LINE channel and a LINE visitor who opened LIFF once (liff.session placeholder, Q-1031) */
async function visitor(s: SeedOrg, label: string) {
  const [channel] = await env.db.select().from(lineChannel).where(eq(lineChannel.branchId, s.branchId));
  const providerId = channel?.providerId ?? `p-${label}`;
  if (!channel)
    await env.db.insert(lineChannel).values({
      organizationId: s.orgId,
      branchId: s.branchId,
      providerId,
      messagingChannelId: `m-${label}`,
      channelSecretEnc: "x",
      channelAccessTokenEnc: "x",
      loginChannelId: `l-${label}`,
      liffId: `liff-${label}`,
      status: "active",
    });
  const [profile] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "LINE name" }).returning();
  if (!profile) throw new Error("profile fixture");
  const [identity] = await env.db
    .insert(lineIdentity)
    .values({
      providerId,
      lineUserId: `U-${label}-${crypto.randomUUID().slice(0, 6)}`,
      ownerProfileId: profile.id,
      displayName: "Mali LINE",
    })
    .returning();
  if (!identity) throw new Error("identity fixture");
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: profile.id, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return { profileId: profile.id, identityId: identity.id, token };
}
const call = (slug: string, token: string, body: unknown) =>
  POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/register`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug } },
  );
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

it("new phone: fills the profile, writes 3 consents and creates a line_liff customer", async () => {
  const s = await seedOrg(env.db, "rg1");
  const v = await visitor(s, "rg1");
  const res = await call("shop-rg1", v.token, VALID);
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffRegisterResponse;
  expect(LiffRegisterResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    registered: true,
    linkPending: false,
    profile: { displayName: "Mali LINE" },
    legalVersions: { privacy: "2026-10-01" },
  });
  const [profile] = await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, v.profileId));
  expect(profile).toMatchObject({ firstName: "มะลิ", lastName: "ใจดี", nickname: "ลิลี่", phoneE164: "+66812345678" });
  const [cust] = await env.db.select().from(customer).where(eq(customer.ownerProfileId, v.profileId));
  expect(cust).toMatchObject({ id: body.customerId, organizationId: s.orgId, sourceChannel: "line_liff", photoConsent: "granted" });
  const consents = await env.db.select().from(consentRecord).where(eq(consentRecord.subjectId, v.profileId));
  expect(consents.map((c) => [c.document, c.version, c.accepted]).sort()).toEqual([
    ["photo_consent", "2026-10-01", true],
    ["privacy_notice", "2026-10-01", true],
    ["terms_of_service", "2026-10-01", true],
  ]);
  expect(consents.every((c) => c.subjectType === "owner_profile" && c.organizationId === s.orgId)).toBe(true);
  // registering again answers the same session, no second customer
  expect(await (await call("shop-rg1", v.token, VALID)).json()).toMatchObject({ registered: true, customerId: body.customerId });
  expect(await env.db.select().from(customer).where(eq(customer.ownerProfileId, v.profileId))).toHaveLength(1);
});

it("the phone of an existing customer → link request (no customer), staff.link_request; again → LINK_REQUEST_PENDING", async () => {
  const s = await seedOrg(env.db, "rg2");
  await env.db.update(ownerProfile).set({ phoneE164: "+66812345678" }).where(eq(ownerProfile.id, s.ownerProfileId));
  const v = await visitor(s, "rg2");
  const res = await call("shop-rg2", v.token, { ...VALID, photoConsent: false });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ registered: false, linkPending: true, customerId: null });
  expect(await env.db.select().from(customer).where(eq(customer.ownerProfileId, v.profileId))).toEqual([]);
  const [request] = await env.db.select().from(customerLinkRequest).where(eq(customerLinkRequest.lineIdentityId, v.identityId));
  expect(request).toMatchObject({
    organizationId: s.orgId,
    newOwnerProfileId: v.profileId,
    candidateCustomerId: s.customerId,
    phoneEntered: "+66812345678",
    status: "pending",
  });
  const [photo] = (await env.db.select().from(consentRecord).where(eq(consentRecord.subjectId, v.profileId))).filter(
    (c) => c.document === "photo_consent",
  );
  expect(photo?.accepted).toBe(false);
  const sent = (await env.db.select().from(notification).where(eq(notification.templateKey, "staff.link_request"))).filter(
    (n) => n.organizationId === s.orgId,
  );
  expect(sent.map((n) => n.recipientId).sort()).toEqual([s.staff.front_desk, s.staff.owner].sort());
  expect(sent[0]).toMatchObject({
    dedupeKey: `link_request:${request?.id}:${sent[0]?.recipientId}`,
    payload: { lineName: "Mali LINE", phone: "081-234-5678" },
  });
  expect(await errorCode(await call("shop-rg2", v.token, VALID))).toBe("LINK_REQUEST_PENDING");
});

it("a customer with the same phone in another shop is not a match", async () => {
  const s = await seedOrg(env.db, "rg3");
  const other = await seedOrg(env.db, "rg4");
  await env.db.update(ownerProfile).set({ phoneE164: "+66899999999" }).where(eq(ownerProfile.id, other.ownerProfileId));
  const v = await visitor(s, "rg3");
  expect(await (await call("shop-rg3", v.token, { ...VALID, phone: "0899999999" })).json()).toMatchObject({ registered: true });
});

it("bad phone → INVALID_PHONE; old privacy version / missing fields → VALIDATION_FAILED; another shop's session → UNAUTHENTICATED", async () => {
  const s = await seedOrg(env.db, "rg5");
  const v = await visitor(s, "rg5");
  expect(await errorCode(await call("shop-rg5", v.token, { ...VALID, phone: "12345" }))).toBe("INVALID_PHONE");
  for (const body of [
    { ...VALID, privacyVersion: "2025-01-01" },
    { ...VALID, firstName: "" },
    { ...VALID, photoConsent: undefined },
    { ...VALID, extra: 1 },
  ])
    expect(await errorCode(await call("shop-rg5", v.token, body))).toBe("VALIDATION_FAILED");
  await seedOrg(env.db, "rg6");
  expect(await errorCode(await call("shop-rg6", v.token, VALID))).toBe("UNAUTHENTICATED");
  expect(await env.db.select().from(customer).where(eq(customer.ownerProfileId, v.profileId))).toEqual([]);
});
