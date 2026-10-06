// T-0172 liff.shop: ShopPublic of the session's branch — bookable services / room types only, no internal cost.
import { LiffShopParams, LiffShopResponse } from "@app/contracts/endpoints/liff.shop";
import {
  branch,
  branchHours,
  branchPolicy,
  lineChannel,
  ratePlan,
  roomRate,
  roomType,
  roomUnit,
  service,
  servicePrice,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffShop } from "../../../src/services/liff/shop.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withCustomer("liff.shop", { params: LiffShopParams }, liffShop);
const call = (slug: string, token: string) =>
  GET(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/shop`, {
      headers: { origin: "https://petbooking.test", cookie: `cid=${encodeURIComponent(token)}` },
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

it("returns the branch, hours, policy, LINE links and only bookable services / room types", async () => {
  const s = await seedOrg(env.db, "sh1");
  const o = { organizationId: s.orgId, branchId: s.branchId };
  await env.db
    .update(branch)
    .set({
      phone: "021234567",
      addressLine: "1 ถนนสุขุมวิท",
      district: "วัฒนา",
      province: "กรุงเทพมหานคร",
      postalCode: "10110",
      latitude: 13.7,
      longitude: 100.5,
    })
    .where(eq(branch.id, s.branchId));
  await env.db.insert(branchHours).values([
    { branchId: s.branchId, weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "18:00" },
    { branchId: s.branchId, weekday: 0, isClosed: true },
  ]);
  await env.db.insert(branchPolicy).values({ branchId: s.branchId, policyText: "มาก่อนเวลา 10 นาที" });
  await env.db.insert(lineChannel).values({
    ...o,
    providerId: "p-sh1",
    messagingChannelId: "m-sh1",
    channelSecretEnc: "x",
    channelAccessTokenEnc: "x",
    loginChannelId: "l-sh1",
    liffId: "2011876637-abc",
    botBasicId: "@762czddi",
    status: "active",
  });
  const [bath, hidden, archived] = await env.db
    .insert(service)
    .values([
      { ...o, scope: "grooming", category: "bath", nameTh: "อาบน้ำ", estCostSatang: 5000, sortOrder: 2 },
      { ...o, scope: "grooming", category: "spa", nameTh: "สปา (ร้านเท่านั้น)", onlineBookable: false },
      { ...o, scope: "grooming", category: "nail", nameTh: "ตัดเล็บ", status: "archived" },
    ])
    .returning();
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...o, code: "STD", name: "ปกติ", isDefault: true })
    .returning();
  if (!bath || !hidden || !archived || !plan) throw new Error("seed failed");
  await env.db
    .insert(servicePrice)
    .values({ organizationId: s.orgId, serviceId: bath.id, ratePlanId: plan.id, priceSatang: 35000, durationMinutes: 60 });
  const [room, offline] = await env.db
    .insert(roomType)
    .values([
      { ...o, nameTh: "ห้องมาตรฐาน", speciesAllowed: ["dog"], amenities: ["แอร์"] },
      { ...o, nameTh: "ห้องพิเศษ", onlineBookable: false },
    ])
    .returning();
  if (!room || !offline) throw new Error("seed failed");
  await env.db.insert(roomRate).values({ organizationId: s.orgId, roomTypeId: room.id, ratePlanId: plan.id, nightlyPriceSatang: 50000 });
  await env.db.insert(roomUnit).values([
    { ...o, roomTypeId: room.id, code: "A1" },
    { ...o, roomTypeId: room.id, code: "A2", status: "maintenance" },
  ]);

  const res = await call("shop-sh1", await cid(s));
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffShopResponse;
  expect(LiffShopResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    name: "Shop sh1",
    logoUrl: null,
    phone: "021234567",
    address: "1 ถนนสุขุมวิท วัฒนา กรุงเทพมหานคร 10110",
    province: "กรุงเทพมหานคร",
    latitude: 13.7,
    longitude: 100.5,
    hours: [
      { weekday: 0, isClosed: true, opensAt: null, closesAt: null },
      { weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "18:00" },
    ],
    policyText: "มาก่อนเวลา 10 นาที",
    addFriendUrl: "https://line.me/R/ti/p/@762czddi",
    liffUrl: "https://liff.line.me/2011876637-abc",
    liffId: "2011876637-abc",
  });
  expect(body.services.map((x) => x.nameTh)).toEqual(["อาบน้ำ"]);
  expect(body.services[0]).toMatchObject({ estCostSatang: null, fromPriceSatang: 35000 });
  expect(body.roomTypes).toHaveLength(1);
  expect(body.roomTypes[0]).toMatchObject({ nameTh: "ห้องมาตรฐาน", unitCount: 1, rates: [{ sizeTierId: null, nightlyPriceSatang: 50000 }] });
});

it("a shop without LINE / policy / address gives nulls", async () => {
  const s = await seedOrg(env.db, "sh2");
  const body = (await (await call("shop-sh2", await cid(s))).json()) as LiffShopResponse;
  expect(body).toMatchObject({
    address: null,
    province: null,
    policyText: null,
    addFriendUrl: null,
    liffUrl: null,
    liffId: null,
    services: [],
    roomTypes: [],
  });
});

it("another shop's session → UNAUTHENTICATED; unknown slug → NOT_FOUND", async () => {
  const a = await seedOrg(env.db, "sh3");
  await seedOrg(env.db, "sh4");
  expect(await errorCode(await call("shop-sh4", await cid(a)))).toBe("UNAUTHENTICATED");
  expect(await errorCode(await call("no-such-shop", await cid(a)))).toBe("NOT_FOUND");
});

it("a LINE channel that is not active gives no LINE links (Q-1037)", async () => {
  const s = await seedOrg(env.db, "sh5");
  await env.db.insert(lineChannel).values({
    organizationId: s.orgId,
    branchId: s.branchId,
    providerId: "p-sh5",
    messagingChannelId: "m-sh5",
    channelSecretEnc: "x",
    channelAccessTokenEnc: "x",
    loginChannelId: "l-sh5",
    liffId: "2011876637-sh5",
    botBasicId: "@sh5",
    status: "pending",
  });
  const body = (await (await call("shop-sh5", await cid(s))).json()) as LiffShopResponse;
  expect(body).toMatchObject({ addFriendUrl: null, liffUrl: null, liffId: null });
});
