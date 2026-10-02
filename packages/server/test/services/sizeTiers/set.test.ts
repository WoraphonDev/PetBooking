import { SizeTiersSetRequest, SizeTiersSetResponse } from "@app/contracts/endpoints/sizeTiers.set";
import { booking, groomAppointment, groomStation, packageTemplate, pet, ratePlan, service, servicePrice, sizeTier } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { discontinuousRows, sizeTiersSet } from "../../../src/services/sizeTiers/set.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const PUT = withStaff("sizeTiers.set", { body: SizeTiersSetRequest }, sizeTiersSet);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(groomAppointment);
  await env.db.delete(packageTemplate);
  await env.db.delete(sizeTier);
  resetRateLimits();
});

const tierS = { code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 6000 as number | null };
const tierM = { code: "M", labelTh: "กลาง", minWeightGrams: 6000, maxWeightGrams: 15000 as number | null };
const tierL = { code: "L", labelTh: "ใหญ่", minWeightGrams: 15000, maxWeightGrams: null as number | null };
const dogTiers = [tierS, tierM, tierL];
async function put(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request("https://petbooking.test/api/v1/staff/size-tiers", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const owner = () => staffCtx(env.base, "owner");
const rowsOf = (species: "dog" | "cat", branchId = env.base.branchId) =>
  env.db
    .select()
    .from(sizeTier)
    .where(eq(sizeTier.branchId, branchId))
    .orderBy(asc(sizeTier.sortOrder))
    .then((r) => r.filter((t) => t.species === species));

it("creates a continuous tier set and returns it as SizeTierItem[] in weight order", async () => {
  const response = await put({ species: "dog", tiers: [tierL, tierS, tierM] });
  expect(response.status).toBe(200);
  const body = SizeTiersSetResponse.parse(await response.json());
  const rows = await rowsOf("dog");
  expect(body).toEqual(
    rows.map((r) => ({
      id: r.id,
      species: r.species,
      code: r.code,
      labelTh: r.labelTh,
      minWeightGrams: r.minWeightGrams,
      maxWeightGrams: r.maxWeightGrams,
      sortOrder: r.sortOrder,
    })),
  );
  expect(rows.map((r) => [r.code, r.labelTh, r.minWeightGrams, r.maxWeightGrams, r.sortOrder, r.organizationId])).toEqual([
    ["S", "เล็ก", 0, 6000, 0, env.base.orgId],
    ["M", "กลาง", 6000, 15000, 1, env.base.orgId],
    ["L", "ใหญ่", 15000, null, 2, env.base.orgId],
  ]);
  expect(rows[0]?.createdAt).toEqual(rows[0]?.updatedAt);
});

it("updates kept rows by id (including swapped codes), inserts new rows, deletes omitted ones and leaves the other species alone", async () => {
  const dog = await sizeTiersSet(owner(), { species: "dog", tiers: dogTiers });
  const cat = await sizeTiersSet(owner(), {
    species: "cat",
    tiers: [{ code: "A", labelTh: "แมว", minWeightGrams: 0, maxWeightGrams: null }],
  });
  const [s, m] = dog;
  const result = await sizeTiersSet(owner(), {
    species: "dog",
    tiers: [
      { id: s?.id, code: "M", labelTh: "เล็กมาก", minWeightGrams: 0, maxWeightGrams: 4000 },
      { id: m?.id, code: "S", labelTh: "กลาง", minWeightGrams: 4000, maxWeightGrams: 10000 },
      { code: "XL", labelTh: "ใหญ่มาก", minWeightGrams: 10000, maxWeightGrams: null },
    ],
  });
  expect(result.map((t) => [t.id === s?.id, t.id === m?.id, t.code, t.minWeightGrams, t.maxWeightGrams, t.sortOrder])).toEqual([
    [true, false, "M", 0, 4000, 0],
    [false, true, "S", 4000, 10000, 1],
    [false, false, "XL", 10000, null, 2],
  ]);
  expect((await rowsOf("dog")).map((r) => r.code)).toEqual(["M", "S", "XL"]);
  expect((await rowsOf("cat")).map((r) => r.id)).toEqual(cat.map((c) => c.id));
  const [updated] = await env.db
    .select()
    .from(sizeTier)
    .where(eq(sizeTier.id, s?.id ?? ""));
  expect(updated?.updatedAt).toEqual(TEST_NOW);
});

it("deletes tiers whose only references are prices (they cascade) and accepts an empty set", async () => {
  const [s] = await sizeTiersSet(owner(), { species: "dog", tiers: dogTiers });
  const [svc] = await env.db
    .insert(service)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, name: "มาตรฐาน" })
    .returning();
  await env.db.insert(servicePrice).values({
    organizationId: env.base.orgId,
    serviceId: svc?.id ?? "",
    ratePlanId: plan?.id ?? "",
    sizeTierId: s?.id,
    priceSatang: 30000,
    durationMinutes: 60,
  });
  expect(await sizeTiersSet(owner(), { species: "dog", tiers: [] })).toEqual([]);
  expect(await rowsOf("dog")).toEqual([]);
  expect(await env.db.select().from(servicePrice)).toEqual([]);
});

it.each([
  ["not starting at 0", [{ ...tierS, minWeightGrams: 1000 }, tierM, tierL], [0]],
  ["a gap", [tierS, { ...tierM, minWeightGrams: 7000 }, tierL], [1]],
  ["an overlap", [tierS, { ...tierM, minWeightGrams: 5000 }, tierL], [1]],
  ["a ceiling on the last row", [tierS, tierM, { ...tierL, maxWeightGrams: 40000 }], [2]],
  ["an open row before the last", [tierS, { ...tierM, maxWeightGrams: null }, tierL], [2]],
])("rejects %s with SIZE_TIER_OVERLAP and the input row indexes", async (_case, tiers, rows) => {
  const response = await put({ species: "dog", tiers });
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "SIZE_TIER_OVERLAP", details: { rows } } });
  expect(await rowsOf("dog")).toEqual([]);
});

it("reports indexes of the submitted order, not the weight order", () => {
  expect(discontinuousRows([tierL, { ...tierM, minWeightGrams: 7000 }, tierS])).toEqual([1]);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const invalid of [
    {},
    { species: "other", tiers: dogTiers },
    { species: "dog" },
    { species: "dog", tiers: [{ ...tierS, code: "s" }] },
    { species: "dog", tiers: [{ ...tierS, code: "SMALL" }] },
    { species: "dog", tiers: [{ ...tierS, labelTh: "" }] },
    { species: "dog", tiers: [{ ...tierS, labelTh: "ก".repeat(31) }] },
    { species: "dog", tiers: [{ ...tierS, minWeightGrams: 1.5 }] },
    { species: "dog", tiers: [{ ...tierS, maxWeightGrams: 0 }] },
    { species: "dog", tiers: [{ ...tierS, id: "nope" }] },
    { species: "dog", tiers: [tierS, { ...tierM, code: "S" }, tierL] },
  ]) {
    const response = await put(invalid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

async function referenceFromAppointment(org: SeedOrg, sizeTierId: string) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "T1" })
    .returning();
  const [b] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: "B-001",
      channel: "walk_in",
      createdByType: "staff",
      status: "closed",
      policySnapshot: {},
    })
    .returning();
  const at = new Date("2026-09-01T03:00:00.000Z");
  const end = new Date("2026-09-01T04:00:00.000Z");
  await env.db.insert(groomAppointment).values({
    ...tenant,
    bookingId: b?.id ?? "",
    petId: p?.id ?? "",
    stationId: st?.id ?? "",
    groomerId: org.staff.staff,
    sizeTierId,
    startsAt: at,
    endsAt: end,
    blockedUntil: end,
    status: "picked_up",
  });
}

it("returns IN_USE when an omitted tier is referenced by an appointment, without changing anything", async () => {
  const [s, m, l] = await sizeTiersSet(owner(), { species: "dog", tiers: dogTiers });
  await referenceFromAppointment(env.base, s?.id ?? "");
  const response = await put({
    species: "dog",
    tiers: [
      { id: m?.id, ...tierM, minWeightGrams: 0 },
      { id: l?.id, ...tierL },
    ],
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "IN_USE" } });
  expect((await rowsOf("dog")).map((r) => [r.code, r.minWeightGrams])).toEqual([
    ["S", 0],
    ["M", 6000],
    ["L", 15000],
  ]);
  // keeping the referenced tier is fine
  expect(await sizeTiersSet(owner(), { species: "dog", tiers: [{ id: s?.id, ...tierS, maxWeightGrams: null }] })).toHaveLength(1);
});

it("returns IN_USE when an omitted tier is referenced by a package template", async () => {
  const [s, m, l] = await sizeTiersSet(owner(), { species: "dog", tiers: dogTiers });
  const [svc] = await env.db
    .insert(service)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  await env.db.insert(packageTemplate).values({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    nameTh: "อาบ 10 ครั้ง",
    serviceId: svc?.id ?? "",
    sizeTierId: l?.id,
    sessionsCount: 10,
    priceSatang: 300000,
  });
  const response = await put({
    species: "dog",
    tiers: [
      { id: s?.id, ...tierS },
      { id: m?.id, ...tierM, maxWeightGrams: null },
    ],
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "IN_USE" } });
  expect(await rowsOf("dog")).toHaveLength(3);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await put({ species: "dog", tiers: dogTiers }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(await rowsOf("dog")).toEqual([]);
});

it("denies absent sessions and customer actors", async () => {
  expect((await PUT(new Request("https://petbooking.test/api/v1/staff/size-tiers", { method: "PUT" }))).status).toBe(401);
  await expect(sizeTiersSet(customerCtx(env.base), { species: "dog", tiers: dogTiers })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch or tier ids, and for ids of the other species", async () => {
  const foreign = await otherOrg(env.db);
  const [foreignTier] = await sizeTiersSet(staffCtx(foreign, "owner"), {
    species: "dog",
    tiers: [{ ...tierS, maxWeightGrams: null }],
  });
  for (const branchId of [foreign.branchId, null]) {
    await expect(sizeTiersSet({ ...owner(), branchId }, { species: "dog", tiers: dogTiers })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await expect(
    sizeTiersSet(owner(), { species: "dog", tiers: [{ id: foreignTier?.id, ...tierS, maxWeightGrams: null }] }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const [catTier] = await sizeTiersSet(owner(), { species: "cat", tiers: [{ ...tierS, maxWeightGrams: null }] });
  await expect(
    sizeTiersSet(owner(), { species: "dog", tiers: [{ id: catTier?.id, ...tierS, maxWeightGrams: null }] }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await rowsOf("dog", foreign.branchId)).map((r) => r.id)).toEqual([foreignTier?.id]);
  expect(await rowsOf("dog")).toEqual([]);
});
