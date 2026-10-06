// T-0182 public.branch: ShopPublic by booking slug without a session; cached 60 s.
import { PublicBranchParams, PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import { branch, branchPolicy, lineChannel, organization, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import { PUBLIC_BRANCH_CACHE_MS, publicBranch, resetPublicBranchCache } from "../../../src/services/public/branch.ts";
import { seedOrg, setupTestDb, type TestEnv, TEST_NOW } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withPublic("public.branch", { params: PublicBranchParams }, publicBranch);
const call = (slug: string) =>
  GET(new Request(`https://petbooking.test/api/v1/public/branches/${slug}`), { params: { bookingSlug: slug } });
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const at = (ms: number) => makeSystemCtx(null, new Date(TEST_NOW.getTime() + ms));

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => {
  resetRateLimits();
  resetPublicBranchCache();
});

it("returns the shop's public data without a session, LINE links when connected", async () => {
  const s = await seedOrg(env.db, "pb1");
  const o = { organizationId: s.orgId, branchId: s.branchId };
  await env.db.update(branch).set({ phone: "021234567", moduleHotel: true }).where(eq(branch.id, s.branchId));
  await env.db.insert(branchPolicy).values({ branchId: s.branchId, policyText: "มาก่อนเวลา 10 นาที" });
  await env.db.insert(lineChannel).values({
    ...o,
    providerId: "p-pb1",
    messagingChannelId: "m-pb1",
    channelSecretEnc: "x",
    channelAccessTokenEnc: "x",
    loginChannelId: "l-pb1",
    liffId: "2011876637-pb1",
    botBasicId: "@pb1",
    status: "active",
  });
  await env.db.insert(service).values([
    { ...o, scope: "grooming", category: "bath", nameTh: "อาบน้ำ", estCostSatang: 5000 },
    { ...o, scope: "grooming", category: "spa", nameTh: "สปา (ร้านเท่านั้น)", onlineBookable: false },
  ]);

  const res = await call("shop-pb1");
  expect(res.status).toBe(200);
  const body = (await res.json()) as PublicBranchResponse;
  expect(PublicBranchResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    name: "Shop pb1",
    phone: "021234567",
    modules: { grooming: true, hotel: true, daycare: false },
    policyText: "มาก่อนเวลา 10 นาที",
    addFriendUrl: "https://line.me/R/ti/p/@pb1",
    liffUrl: "https://liff.line.me/2011876637-pb1",
    liffId: "2011876637-pb1",
  });
  expect(body.services.map((x) => x.nameTh)).toEqual(["อาบน้ำ"]);
  expect(body.services[0]?.estCostSatang).toBeNull();
});

it("a shop without LINE: no liffUrl, the phone is there to call", async () => {
  const s = await seedOrg(env.db, "pb2");
  await env.db.update(branch).set({ phone: "0812345678" }).where(eq(branch.id, s.branchId));
  const body = (await (await call("shop-pb2")).json()) as PublicBranchResponse;
  expect(body).toMatchObject({ phone: "0812345678", liffUrl: null, liffId: null, addFriendUrl: null });
});

it("empty slug → VALIDATION_FAILED; unknown / inactive branch / suspended shop → NOT_FOUND", async () => {
  expect(await errorCode(await call(""))).toBe("VALIDATION_FAILED");
  expect(await errorCode(await call("no-such-shop"))).toBe("NOT_FOUND");
  const inactive = await seedOrg(env.db, "pb3");
  await env.db.update(branch).set({ status: "archived" }).where(eq(branch.id, inactive.branchId));
  expect(await errorCode(await call("shop-pb3"))).toBe("NOT_FOUND");
  const suspended = await seedOrg(env.db, "pb4");
  await env.db.update(organization).set({ status: "suspended" }).where(eq(organization.id, suspended.orgId));
  expect(await errorCode(await call("shop-pb4"))).toBe("NOT_FOUND");
});

it("caches the response for 60 seconds per slug", async () => {
  const s = await seedOrg(env.db, "pb5");
  const input = { bookingSlug: "shop-pb5" };
  expect((await publicBranch(at(0), input)).phone).toBeNull();
  await env.db.update(branch).set({ phone: "021112222" }).where(eq(branch.id, s.branchId));
  expect((await publicBranch(at(PUBLIC_BRANCH_CACHE_MS - 1), input)).phone).toBeNull();
  expect((await publicBranch(at(PUBLIC_BRANCH_CACHE_MS), input)).phone).toBe("021112222");
});
