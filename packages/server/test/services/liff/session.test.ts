// T-0170 liff.session: LINE ID token → line_identity upsert + cid session (Q-1031 placeholder owner_profile).
import { LiffSessionParams, LiffSessionRequest, LiffSessionResponse } from "@app/contracts/endpoints/liff.session";
import { customer, customerLinkRequest, lineChannel, lineIdentity, ownerProfile, session } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { hashToken } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import { liffSession } from "../../../src/services/liff/session.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const POST = withPublic("liff.session", { params: LiffSessionParams, body: LiffSessionRequest }, liffSession);
const open = (slug: string, body: unknown) =>
  POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug } },
  );

const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

let n = 0;
async function shop(status: "active" | "pending" | "error" = "active"): Promise<SeedOrg & { slug: string; providerId: string }> {
  const s = await seedOrg(env.db, `liff${++n}`);
  await env.db.insert(lineChannel).values({
    organizationId: s.orgId,
    branchId: s.branchId,
    providerId: `prov-liff${n}`,
    messagingChannelId: `msg-liff${n}`,
    channelSecretEnc: "x",
    channelAccessTokenEnc: "x",
    loginChannelId: `login-liff${n}`,
    liffId: `liff-${n}`,
    status,
  });
  return { ...s, slug: `shop-liff${n}`, providerId: `prov-liff${n}` };
}

async function cookieSession(res: Response) {
  const token = res.headers.get("set-cookie")?.match(/^cid=([^;]+)/)?.[1];
  if (!token) return null;
  const [row] = await env.db
    .select()
    .from(session)
    .where(eq(session.tokenHash, hashToken(decodeURIComponent(token))));
  return row ?? null;
}

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  vi.stubEnv("LINE_FAKE", "1");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("first visit: placeholder owner_profile + line_identity, unregistered cid session", async () => {
  const s = await shop();
  const res = await open(s.slug, { idToken: "fake:U-new:มะลิ" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(LiffSessionResponse.safeParse(body).success).toBe(true);
  expect(body).toEqual({
    registered: false,
    linkPending: false,
    profile: { displayName: "มะลิ", pictureUrl: null },
    customerId: null,
    legalVersions: { privacy: "2026-10-01", terms: "2026-10-01" },
  });
  const [identity] = await env.db
    .select()
    .from(lineIdentity)
    .where(and(eq(lineIdentity.providerId, s.providerId), eq(lineIdentity.lineUserId, "U-new")));
  expect(identity).toMatchObject({ displayName: "มะลิ", pictureUrl: null });
  const [profile] = await env.db
    .select()
    .from(ownerProfile)
    .where(eq(ownerProfile.id, identity?.ownerProfileId ?? ""));
  expect(profile).toMatchObject({ createdInOrgId: s.orgId, firstName: "มะลิ", phoneE164: null });
  const stored = await cookieSession(res);
  expect(stored).toMatchObject({
    subjectType: "customer",
    subjectId: identity?.ownerProfileId,
    organizationId: s.orgId,
    branchId: s.branchId,
  });
  expect((stored?.expiresAt.getTime() ?? 0) - (stored?.lastSeenAt.getTime() ?? 0)).toBe(30 * 24 * 60 * 60_000);
});

it("returning customer: identity updated (no second profile), registered session with customerId", async () => {
  const s = await shop();
  await env.db
    .insert(lineIdentity)
    .values({ providerId: s.providerId, lineUserId: "U-known", ownerProfileId: s.ownerProfileId, displayName: "เก่า" });
  const res = await open(s.slug, { idToken: "fake:U-known:ใหม่" });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ registered: true, customerId: s.customerId, profile: { displayName: "ใหม่" } });
  const rows = await env.db.select().from(lineIdentity).where(eq(lineIdentity.lineUserId, "U-known"));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.ownerProfileId).toBe(s.ownerProfileId);
  expect(await cookieSession(res)).toMatchObject({ subjectId: s.ownerProfileId });
});

it("linkPending when the identity has a pending link request", async () => {
  const s = await shop();
  const first = await open(s.slug, { idToken: "fake:U-link:ส้ม" });
  expect(first.status).toBe(200);
  const [identity] = await env.db.select().from(lineIdentity).where(eq(lineIdentity.lineUserId, "U-link"));
  if (!identity) throw new Error("identity missing");
  await env.db.insert(customerLinkRequest).values({
    organizationId: s.orgId,
    lineIdentityId: identity.id,
    newOwnerProfileId: identity.ownerProfileId,
    candidateCustomerId: s.customerId,
    phoneEntered: "+66812345678",
  });
  const res = await open(s.slug, { idToken: "fake:U-link:ส้ม" });
  expect(await res.json()).toMatchObject({ registered: false, linkPending: true });
});

it("a customer of another shop is not registered here", async () => {
  const s = await shop();
  const other = await shop();
  await env.db.insert(lineIdentity).values({ providerId: s.providerId, lineUserId: "U-other", ownerProfileId: other.ownerProfileId });
  // other's profile has a customer only in other's org
  expect((await env.db.select().from(customer).where(eq(customer.ownerProfileId, other.ownerProfileId))).length).toBe(1);
  const res = await open(s.slug, { idToken: "fake:U-other:x" });
  expect(await res.json()).toMatchObject({ registered: false, customerId: null });
});

it("LINE_TOKEN_INVALID when the ID token does not verify", async () => {
  const s = await shop();
  const res = await open(s.slug, { idToken: "not-a-valid-token" });
  expect(res.status).toBe(401);
  expect(await errorCode(res)).toBe("LINE_TOKEN_INVALID");
  expect(res.headers.get("set-cookie")).toBeNull();
});

it.each(["pending", "error"] as const)("LINE_NOT_CONNECTED when line_channel is %s", async (status) => {
  const s = await shop(status);
  const res = await open(s.slug, { idToken: "fake:U-x:x" });
  expect(res.status).toBe(422);
  expect(await errorCode(res)).toBe("LINE_NOT_CONNECTED");
});

it("LINE_NOT_CONNECTED when the branch has no line_channel", async () => {
  await seedOrg(env.db, `liff-none${++n}`);
  const res = await open(`shop-liff-none${n}`, { idToken: "fake:U-x:x" });
  expect(await errorCode(res)).toBe("LINE_NOT_CONNECTED");
});

it("unknown branch slug → NOT_FOUND", async () => {
  const res = await open("no-such-shop", { idToken: "fake:U-x:x" });
  expect(res.status).toBe(404);
  expect(await errorCode(res)).toBe("NOT_FOUND");
});

it.each([[{}], [{ idToken: "" }], [{ idToken: 5 }]])("VALIDATION_FAILED for %j", async (body) => {
  const s = await shop();
  const res = await open(s.slug, body);
  expect(res.status).toBe(422);
  expect(await errorCode(res)).toBe("VALIDATION_FAILED");
});
