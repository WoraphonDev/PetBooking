// T-0175 liff.groomSlots: R-04 slots on the online channel for the customer's own pet, R-02/R-03 price + duration.
import { LiffGroomSlotsParams, LiffGroomSlotsRequest, LiffGroomSlotsResponse } from "@app/contracts/endpoints/liff.groomSlots";
import {
  branch,
  branchHours,
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
  staffWorkingHours,
} from "@app/db/schema";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffGroomSlots } from "../../../src/services/liff/groomSlots.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const TZ = "Asia/Bangkok";
/** 3 days ahead: past the online lead time, well inside the 60-day horizon */
const DATE = toLocalDate({ instant: new Date(Date.now() + 3 * 86_400_000).toISOString(), timezone: TZ });
const at = (time: string) => localToUtc({ date: DATE, time, timezone: TZ });

let env: TestEnv;
const POST = withCustomer("liff.groomSlots", { params: LiffGroomSlotsParams, body: LiffGroomSlotsRequest }, liffGroomSlots);
type Shop = SeedOrg & { ids: Record<string, string>; token: string };

/** a shop open 09:00–12:00 every day, one groomer (staff) on one station, 30-min steps, no buffer */
async function shop(label: string): Promise<Shop> {
  const s = await seedOrg(env.db, label);
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  const ids: Record<string, string> = {};
  await env.db
    .insert(branchHours)
    .values(
      Array.from({ length: 7 }, (_, weekday) => ({ branchId: s.branchId, weekday, isClosed: false, opensAt: "09:00", closesAt: "12:00" })),
    );
  await env.db.insert(branchPolicy).values({ branchId: s.branchId, slotStepMinutes: 30, bufferMinutes: 0 });
  await env.db.insert(groomStation).values({ ...tenant, name: "T1" });
  await env.db.update(staffUser).set({ isGroomer: true, displayName: "พี่ฝน" }).where(eq(staffUser.id, s.staff.staff));
  await env.db
    .insert(staffWorkingHours)
    .values(
      Array.from({ length: 7 }, (_, weekday) => ({ ...tenant, staffUserId: s.staff.staff, weekday, startsAt: "09:00", endsAt: "12:00" })),
    );
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ปกติ", isDefault: true })
    .returning();
  const [tier] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 })
    .returning();
  ids.tier = tier?.id ?? "";
  const [bath, nail, offline, noPrice] = await env.db
    .insert(service)
    .values([
      { ...tenant, category: "bath", nameTh: "อาบน้ำ" },
      { ...tenant, category: "nail", nameTh: "ตัดเล็บ", isAddon: true },
      { ...tenant, category: "spa", nameTh: "สปา (ร้านเท่านั้น)", onlineBookable: false },
      { ...tenant, category: "bath", nameTh: "อาบน้ำพิเศษ" },
    ])
    .returning();
  Object.assign(ids, { bath: bath?.id ?? "", nail: nail?.id ?? "", offline: offline?.id ?? "", noPrice: noPrice?.id ?? "" });
  const price = (serviceId: string, priceSatang: number, durationMinutes: number) => ({
    organizationId: s.orgId,
    serviceId,
    ratePlanId: plan?.id ?? "",
    sizeTierId: ids.tier,
    coatGroup: "any" as const,
    priceSatang,
    durationMinutes,
  });
  await env.db
    .insert(servicePrice)
    .values([price(ids.bath ?? "", 30_000, 45), price(ids.nail ?? "", 5_000, 15), price(ids.offline ?? "", 1, 15)]);
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
  return { ...s, ids, token };
}
const call = (s: Shop, body: unknown, label: string) =>
  POST(
    new Request(`https://petbooking.test/api/v1/liff/shop-${label}/availability/groom-slots`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(s.token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: `shop-${label}` } },
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

it("returns online slots with the groomer's display name, total duration and price", async () => {
  const s = await shop("gs1");
  const res = await call(s, { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.bath], addonIds: [s.ids.nail] }, "gs1");
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffGroomSlotsResponse;
  expect(LiffGroomSlotsResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({ date: DATE, reason: "ok", durationMinutes: 60, priceSatang: 35_000 });
  expect(body.slots.map((x) => x.startsAt)).toEqual([at("09:00"), at("09:30"), at("10:00"), at("10:30"), at("11:00")]);
  expect(body.slots[0]).toMatchObject({ endsAt: at("10:00"), groomerId: s.staff.staff, groomerName: "พี่ฝน" });
});

it("a pet without weight needs the customer's size choice (WEIGHT_REQUIRED), then prices by it", async () => {
  const s = await shop("gs2");
  expect(await errorCode(await call(s, { date: DATE, petId: s.ids.kuma, serviceIds: [s.ids.bath] }, "gs2"))).toBe("WEIGHT_REQUIRED");
  const res = await call(s, { date: DATE, petId: s.ids.kuma, serviceIds: [s.ids.bath], sizeTierId: s.ids.tier }, "gs2");
  expect(await res.json()).toMatchObject({ reason: "ok", priceSatang: 30_000, durationMinutes: 45 });
});

it("PRICE_NOT_FOUND, MODULE_DISABLED, CUSTOMER_BLACKLISTED", async () => {
  const s = await shop("gs3");
  expect(await errorCode(await call(s, { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.noPrice] }, "gs3"))).toBe("PRICE_NOT_FOUND");
  await env.db.update(customer).set({ blacklisted: true }).where(eq(customer.id, s.customerId));
  expect(await errorCode(await call(s, { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.bath] }, "gs3"))).toBe("CUSTOMER_BLACKLISTED");
  await env.db.update(branch).set({ moduleGrooming: false }).where(eq(branch.id, s.branchId));
  expect(await errorCode(await call(s, { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.bath] }, "gs3"))).toBe("MODULE_DISABLED");
});

it("an in-shop-only service or an add-on as main → VALIDATION_FAILED; bad body → VALIDATION_FAILED", async () => {
  const s = await shop("gs4");
  for (const body of [
    { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.offline] },
    { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.nail] },
    { date: DATE, petId: s.ids.mochi, serviceIds: [] },
    { date: "2026-02-30", petId: s.ids.mochi, serviceIds: [s.ids.bath] },
    { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.bath], excludeAppointmentId: s.ids.bath },
  ])
    expect(await errorCode(await call(s, body, "gs4"))).toBe("VALIDATION_FAILED");
});

it("another owner's pet, another shop's service or groomer → NOT_FOUND", async () => {
  const s = await shop("gs5");
  const t = await shop("gs6");
  const [stranger] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "อื่น" }).returning();
  await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: stranger?.id ?? "" });
  const [theirs] = await env.db
    .insert(pet)
    .values({ ownerProfileId: stranger?.id ?? "", createdInOrgId: s.orgId, name: "x", species: "dog", latestWeightGrams: 3000 })
    .returning();
  await env.db.insert(petShopProfile).values({ organizationId: s.orgId, petId: theirs?.id ?? "" });
  for (const body of [
    { date: DATE, petId: theirs?.id, serviceIds: [s.ids.bath] },
    { date: DATE, petId: s.ids.mochi, serviceIds: [t.ids.bath] },
    { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.bath], groomerId: t.staff.staff },
  ])
    expect(await errorCode(await call(s, body, "gs5"))).toBe("NOT_FOUND");
});

it("rate limit: 30 searches a minute per user, the 31st → RATE_LIMITED", async () => {
  const s = await shop("gs7");
  const body = { date: DATE, petId: s.ids.mochi, serviceIds: [s.ids.bath] };
  for (let i = 0; i < 30; i++) expect((await call(s, body, "gs7")).status).toBe(200);
  expect(await errorCode(await call(s, body, "gs7"))).toBe("RATE_LIMITED");
});
