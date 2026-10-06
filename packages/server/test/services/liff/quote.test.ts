// T-0176 liff.quote: a grooming estimate for the signed-in customer — R-02/R-03 totals, R-06 deposit, R-08 approval.
import { LiffQuoteParams, LiffQuoteRequest, LiffQuoteResponse } from "@app/contracts/endpoints/liff.quote";
import {
  branch,
  branchPolicy,
  customer,
  groomStation,
  ownerProfile,
  pet,
  petShopProfile,
  ratePlan,
  service,
  servicePrice,
  sizeTier,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffQuote } from "../../../src/services/liff/quote.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const START = "2026-12-05T03:00:00.000Z";
let env: TestEnv;
const POST = withCustomer("liff.quote", { params: LiffQuoteParams, body: LiffQuoteRequest }, liffQuote);
type Shop = SeedOrg & { ids: Record<string, string>; token: string; label: string };

async function shop(label: string): Promise<Shop> {
  const s = await seedOrg(env.db, label);
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  await env.db.insert(branchPolicy).values({
    branchId: s.branchId,
    bufferMinutes: 10,
    defaultDepositType: "percent",
    defaultDepositValue: 30,
    policyText: "มาก่อนเวลา 10 นาที",
    groomingFreeCancelHours: 24,
    lateCancelForfeitPercent: 75,
  });
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "T1" })
    .returning();
  await env.db.update(staffUser).set({ isGroomer: true }).where(eq(staffUser.id, s.staff.staff));
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ปกติ", isDefault: true })
    .returning();
  const [tier] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 })
    .returning();
  const [bath, nail, offline, noPrice] = await env.db
    .insert(service)
    .values([
      { ...tenant, category: "bath", nameTh: "อาบน้ำ" },
      { ...tenant, category: "nail", nameTh: "ตัดเล็บ", isAddon: true },
      { ...tenant, category: "spa", nameTh: "สปา", onlineBookable: false },
      { ...tenant, category: "bath", nameTh: "พิเศษ" },
    ])
    .returning();
  const ids: Record<string, string> = {
    station: station?.id ?? "",
    tier: tier?.id ?? "",
    bath: bath?.id ?? "",
    nail: nail?.id ?? "",
    offline: offline?.id ?? "",
    noPrice: noPrice?.id ?? "",
  };
  const price = (serviceId: string, priceSatang: number, durationMinutes: number) => ({
    organizationId: s.orgId,
    serviceId,
    ratePlanId: plan?.id ?? "",
    sizeTierId: ids.tier ?? "",
    coatGroup: "any" as const,
    priceSatang,
    durationMinutes,
  });
  await env.db
    .insert(servicePrice)
    .values([price(ids.bath ?? "", 45_000, 45), price(ids.nail ?? "", 5_000, 15), price(ids.offline ?? "", 1, 15)]);
  const [mochi, kuma] = await env.db
    .insert(pet)
    .values([
      { ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "Mochi", species: "dog", latestWeightGrams: 4_000 },
      { ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "Kuma", species: "dog" },
    ])
    .returning();
  ids.mochi = mochi?.id ?? "";
  ids.kuma = kuma?.id ?? "";
  await env.db.insert(petShopProfile).values([
    { organizationId: s.orgId, petId: ids.mochi },
    { organizationId: s.orgId, petId: ids.kuma },
  ]);
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return { ...s, ids, token, label };
}
const item = (s: Shop, over: Record<string, unknown> = {}) => ({
  petId: s.ids.mochi,
  serviceIds: [s.ids.bath],
  addonIds: [s.ids.nail],
  startsAt: START,
  groomerId: s.staff.staff,
  stationId: s.ids.station,
  ...over,
});
const call = (s: Shop, body: unknown) =>
  POST(
    new Request(`https://petbooking.test/api/v1/liff/shop-${s.label}/quotes`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(s.token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: `shop-${s.label}` } },
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

it("prices the grooming items and returns deposit, approval, policy text and cancel summary", async () => {
  const s = await shop("qt1");
  const res = await call(s, { groom: [item(s)] });
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffQuoteResponse;
  expect(LiffQuoteResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    groom: [
      { servicesTotalSatang: 50_000, durationMinutes: 60, endsAt: "2026-12-05T04:00:00.000Z", blockedUntil: "2026-12-05T04:10:00.000Z" },
    ],
    stays: [],
    daycareTotalSatang: 0,
    estimatedTotalSatang: 50_000,
    depositRequiredSatang: 15_000,
    depositReason: "policy_percent",
    requiresApproval: false,
    policyText: "มาก่อนเวลา 10 นาที",
    cancelSummary: "ยกเลิกก่อนเริ่มบริการอย่างน้อย 24 ชั่วโมง ไม่ริบมัดจำ; ยกเลิกภายหลัง ริบมัดจำ 75%",
  });
});

it("approval follows auto_confirm_grooming and reliability 1; a pet without weight uses the chosen size", async () => {
  const s = await shop("qt2");
  await env.db.update(branchPolicy).set({ autoConfirmGrooming: false }).where(eq(branchPolicy.branchId, s.branchId));
  expect(await (await call(s, { groom: [item(s)] })).json()).toMatchObject({ requiresApproval: true });
  expect(await errorCode(await call(s, { groom: [item(s, { petId: s.ids.kuma })] }))).toBe("WEIGHT_REQUIRED");
  expect(await (await call(s, { groom: [item(s, { petId: s.ids.kuma, sizeTierId: s.ids.tier })] })).json()).toMatchObject({
    estimatedTotalSatang: 50_000,
  });
});

it("missing / bad items, an in-shop-only service, hotel or daycare items → VALIDATION_FAILED", async () => {
  const s = await shop("qt3");
  for (const body of [
    {},
    { groom: [] },
    { groom: [item(s, { serviceIds: [] })] },
    { groom: [item(s, { startsAt: "tomorrow" })] },
    { groom: [item(s, { serviceIds: [s.ids.offline] })] },
    { groom: [item(s)], stays: [{ petId: s.ids.mochi }] },
    { groom: [item(s), { ...item(s), extra: 1 }] },
  ])
    expect(await errorCode(await call(s, body))).toBe("VALIDATION_FAILED");
});

it("PRICE_NOT_FOUND, MODULE_DISABLED, CUSTOMER_BLACKLISTED", async () => {
  const s = await shop("qt4");
  expect(await errorCode(await call(s, { groom: [item(s, { serviceIds: [s.ids.noPrice], addonIds: [] })] }))).toBe("PRICE_NOT_FOUND");
  await env.db.update(customer).set({ blacklisted: true }).where(eq(customer.id, s.customerId));
  expect(await errorCode(await call(s, { groom: [item(s)] }))).toBe("CUSTOMER_BLACKLISTED");
  await env.db.update(branch).set({ moduleGrooming: false }).where(eq(branch.id, s.branchId));
  expect(await errorCode(await call(s, { groom: [item(s)] }))).toBe("MODULE_DISABLED");
});

it("another owner's pet, another shop's service / groomer / station → NOT_FOUND", async () => {
  const s = await shop("qt5");
  const t = await shop("qt6");
  const [stranger] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "อื่น" }).returning();
  await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: stranger?.id ?? "" });
  const [theirs] = await env.db
    .insert(pet)
    .values({ ownerProfileId: stranger?.id ?? "", createdInOrgId: s.orgId, name: "x", species: "dog", latestWeightGrams: 3000 })
    .returning();
  await env.db.insert(petShopProfile).values({ organizationId: s.orgId, petId: theirs?.id ?? "" });
  for (const over of [{ petId: theirs?.id }, { serviceIds: [t.ids.bath] }, { groomerId: t.staff.staff }, { stationId: t.ids.station }])
    expect(await errorCode(await call(s, { groom: [item(s, over)] }))).toBe("NOT_FOUND");
});
