import { QuotesCreateRequest, QuotesCreateResponse } from "@app/contracts/endpoints/quotes.create";
import { booking, branchPolicy, customer, groomStation, pet, ratePlan, service, servicePrice, sizeTier } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { quotesCreate } from "../../../src/services/quotes/create.ts";
import { otherOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let ids: { pet: string; service: string; addon: string; tier: string; station: string; missingPrice: string };
let foreignCustomer: string;
const POST = withStaff("quotes.create", { body: QuotesCreateRequest }, quotesCreate);
beforeAll(async () => {
  env = await setupTestDb();
  foreignCustomer = (await otherOrg(env.db)).customerId;
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  await env.db.insert(branchPolicy).values({
    branchId: env.base.branchId,
    bufferMinutes: 10,
    defaultDepositType: "percent",
    defaultDepositValue: 30,
    policyText: "Policy",
    groomingFreeCancelHours: 24,
    lateCancelForfeitPercent: 75,
  });
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "Standard" })
    .returning();
  const [tier] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "Small", minWeightGrams: 0, maxWeightGrams: 10000 })
    .returning();
  const [main, addon, noPrice] = await env.db
    .insert(service)
    .values([
      { ...tenant, nameTh: "Bath", category: "bath" },
      { ...tenant, nameTh: "Nails", category: "nail", isAddon: true },
      { ...tenant, nameTh: "Spa", category: "bath" },
    ])
    .returning();
  const [subject] = await env.db
    .insert(pet)
    .values({
      ownerProfileId: env.base.ownerProfileId,
      createdInOrgId: env.base.orgId,
      name: "Mali",
      species: "dog",
      coatType: "short",
      latestWeightGrams: 4000,
    })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "Table" })
    .returning();
  ids = {
    pet: subject?.id ?? "",
    service: main?.id ?? "",
    addon: addon?.id ?? "",
    tier: tier?.id ?? "",
    station: station?.id ?? "",
    missingPrice: noPrice?.id ?? "",
  };
  await env.db.insert(servicePrice).values([
    {
      organizationId: tenant.organizationId,
      serviceId: ids.service,
      ratePlanId: plan?.id ?? "",
      sizeTierId: ids.tier,
      coatGroup: "short",
      priceSatang: 12345,
      durationMinutes: 45,
    },
    {
      organizationId: tenant.organizationId,
      serviceId: ids.addon,
      ratePlanId: plan?.id ?? "",
      sizeTierId: null,
      coatGroup: "any",
      priceSatang: 5000,
      durationMinutes: 15,
    },
  ]);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
function input() {
  return QuotesCreateRequest.parse({
    customerId: env.base.customerId,
    groom: [
      {
        petId: ids.pet,
        serviceIds: [ids.service],
        addonIds: [ids.addon],
        startsAt: "2026-10-05T03:00:00.000Z",
        groomerId: env.base.staff.staff,
        stationId: ids.station,
        groomerPreference: "any",
      },
    ],
  });
}
it("quotes exact satang, duration, buffer, deposit and approved cancellation summary without inserting a booking", async () => {
  const result = await quotesCreate(staffCtx(env.base, "owner"), input());
  expect(result).toEqual({
    groom: [
      { servicesTotalSatang: 17345, durationMinutes: 60, endsAt: "2026-10-05T04:00:00.000Z", blockedUntil: "2026-10-05T04:10:00.000Z" },
    ],
    stays: [],
    daycareTotalSatang: 0,
    estimatedTotalSatang: 17345,
    depositRequiredSatang: 5300,
    depositReason: "policy_percent",
    requiresApproval: false,
    policyText: "Policy",
    cancelSummary: "ยกเลิกก่อนเริ่มบริการอย่างน้อย 24 ชั่วโมง ไม่ริบมัดจำ; ยกเลิกภายหลัง ริบมัดจำ 75%",
  });
  expect(QuotesCreateResponse.parse(result)).toEqual(result);
  expect(await env.db.select().from(booking)).toEqual([]);
});
it("sums multiple grooming items independently", async () => {
  const request = input();
  const first = request.groom[0];
  if (!first) throw new Error("fixture");
  request.groom.push({ ...first, startsAt: "2026-10-05T05:00:00.000Z" });
  const result = await quotesCreate(staffCtx(env.base, "front_desk"), request);
  expect(result.estimatedTotalSatang).toBe(34690);
  expect(result.groom[1]?.endsAt).toBe("2026-10-05T06:00:00.000Z");
});
it("uses reliability override for full prepayment and approval, while exemption still wins on deposit", async () => {
  await env.db.update(customer).set({ reliabilityOverride: 1 }).where(eq(customer.id, env.base.customerId));
  expect(await quotesCreate(staffCtx(env.base, "owner"), input())).toMatchObject({
    depositRequiredSatang: 17345,
    depositReason: "reliability_full_prepay",
    requiresApproval: true,
  });
  await env.db.update(customer).set({ depositExempt: true }).where(eq(customer.id, env.base.customerId));
  expect(await quotesCreate(staffCtx(env.base, "owner"), input())).toMatchObject({
    depositRequiredSatang: 0,
    depositReason: "exempt",
    requiresApproval: true,
  });
  await env.db.update(customer).set({ reliabilityOverride: null, depositExempt: false }).where(eq(customer.id, env.base.customerId));
});
it("respects manual approval policy", async () => {
  await env.db.update(branchPolicy).set({ autoConfirmGrooming: false }).where(eq(branchPolicy.branchId, env.base.branchId));
  expect((await quotesCreate(staffCtx(env.base, "owner"), input())).requiresApproval).toBe(true);
  await env.db.update(branchPolicy).set({ autoConfirmGrooming: true }).where(eq(branchPolicy.branchId, env.base.branchId));
});
it("rejects foreign customer and missing pet/service/resource IDs", async () => {
  await expect(quotesCreate(staffCtx(env.base, "owner"), { ...input(), customerId: foreignCustomer })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  for (const field of ["petId", "groomerId", "stationId", "sizeTierId"] as const) {
    const request = input();
    const item = request.groom[0];
    if (!item) throw new Error("fixture");
    item[field] = crypto.randomUUID();
    await expect(quotesCreate(staffCtx(env.base, "owner"), request)).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  const request = input();
  const item = request.groom[0];
  if (!item) throw new Error("fixture");
  item.serviceIds = [crypto.randomUUID()];
  await expect(quotesCreate(staffCtx(env.base, "owner"), request)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("reports a missing price and a missing weight, and supports an explicit tier override", async () => {
  const request = input();
  const item = request.groom[0];
  if (!item) throw new Error("fixture");
  item.serviceIds = [ids.missingPrice];
  await expect(quotesCreate(staffCtx(env.base, "owner"), request)).rejects.toMatchObject({ code: "PRICE_NOT_FOUND" });
  await env.db.update(pet).set({ latestWeightGrams: null }).where(eq(pet.id, ids.pet));
  await expect(quotesCreate(staffCtx(env.base, "owner"), input())).rejects.toMatchObject({ code: "WEIGHT_REQUIRED" });
  const overridden = input();
  const groom = overridden.groom[0];
  if (!groom) throw new Error("fixture");
  groom.sizeTierId = ids.tier;
  expect((await quotesCreate(staffCtx(env.base, "owner"), overridden)).estimatedTotalSatang).toBe(17345);
  await env.db.update(pet).set({ latestWeightGrams: 4000 }).where(eq(pet.id, ids.pet));
});
it("denies staff and rejects malformed or unsupported-module input", async () => {
  await expect(quotesCreate(staffCtx(env.base, "staff"), input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  for (const body of [{}, { ...input(), customerId: "invalid" }, { ...input(), stays: [{}] }]) {
    const s = await createSession(
      env.db,
      { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
      new Date(),
    );
    const r = await POST(
      new Request("https://petbooking.test/api/v1/staff/quotes", {
        method: "POST",
        headers: { cookie: `sid=${s.token}`, origin: "https://petbooking.test", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});
it("returns the exact HTTP response for an allowed role and blocks an unauthenticated request", async () => {
  const url = "https://petbooking.test/api/v1/staff/quotes";
  const s = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.front_desk, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  const response = await POST(
    new Request(url, {
      method: "POST",
      headers: { cookie: `sid=${s.token}`, origin: "https://petbooking.test", "content-type": "application/json" },
      body: JSON.stringify(input()),
    }),
  );
  expect(response.status).toBe(200);
  expect(QuotesCreateResponse.parse(await response.json()).estimatedTotalSatang).toBe(17345);
  expect((await POST(new Request(url, { method: "POST", headers: { origin: "https://petbooking.test" } }))).status).toBe(401);
});
it("enforces level-two minimum deposit with policy none and rejects add-ons supplied as main services", async () => {
  await env.db.update(customer).set({ reliabilityLevel: 2 }).where(eq(customer.id, env.base.customerId));
  await env.db.update(branchPolicy).set({ defaultDepositType: "none" }).where(eq(branchPolicy.branchId, env.base.branchId));
  expect(await quotesCreate(staffCtx(env.base, "owner"), input())).toMatchObject({
    depositRequiredSatang: 5300,
    depositReason: "reliability_min_30",
  });
  const request = input();
  const groom = request.groom[0];
  if (!groom) throw new Error("fixture");
  groom.serviceIds = [ids.addon];
  await expect(quotesCreate(staffCtx(env.base, "owner"), request)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
});
