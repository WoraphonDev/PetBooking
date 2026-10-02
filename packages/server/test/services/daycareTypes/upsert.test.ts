import { DaycareTypesUpsertRequest, DaycareTypesUpsertResponse } from "@app/contracts/endpoints/daycareTypes.upsert";
import { daycareRate, daycareSessionType, ratePlan, sizeTier } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { daycareTypesUpsert } from "../../../src/services/daycareTypes/upsert.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const PUT = withStaff("daycareTypes.upsert", { body: DaycareTypesUpsertRequest }, daycareTypesUpsert);
let env: TestEnv;
let foreign: SeedOrg;
const ids = { plan: "", tier: "", foreignTier: "", foreignSession: "" };
const full = { session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 12, status: "active" } as const;
const morning = { session: "morning", nameTh: "ครึ่งวันเช้า", startsAt: "08:00", endsAt: "12:00", capacity: 6, status: "active" } as const;

async function addTier(org: SeedOrg) {
  const [t] = await env.db
    .insert(sizeTier)
    .values({ organizationId: org.orgId, branchId: org.branchId, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0 })
    .returning();
  return t?.id ?? "";
}
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, name: "ราคาปกติ" })
    .returning();
  ids.plan = plan?.id ?? "";
  ids.tier = await addTier(env.base);
  foreign = await otherOrg(env.db);
  ids.foreignTier = await addTier(foreign);
  const [fs] = await env.db
    .insert(daycareSessionType)
    .values({ organizationId: foreign.orgId, branchId: foreign.branchId, ...full })
    .returning();
  ids.foreignSession = fs?.id ?? "";
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(daycareSessionType).where(eq(daycareSessionType.branchId, env.base.branchId));
  resetRateLimits();
});
async function put(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request("https://petbooking.test/api/v1/staff/daycare-session-types", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const owner = () => staffCtx(env.base, "owner");
const upsert = (items: unknown[]) => daycareTypesUpsert(owner(), DaycareTypesUpsertRequest.parse({ items }));

it("creates sessions with prices on the default rate plan and returns every field", async () => {
  const response = await put({
    items: [
      { ...morning, rates: [] },
      {
        ...full,
        rates: [{ priceSatang: 50_000 }, { sizeTierId: ids.tier, priceSatang: 45_000 }],
      },
    ],
  });
  expect(response.status).toBe(200);
  const body = DaycareTypesUpsertResponse.parse(await response.json());
  expect(body).toEqual([
    {
      id: expect.any(String),
      ...full,
      rates: [
        { sizeTierId: null, priceSatang: 50_000 },
        { sizeTierId: ids.tier, priceSatang: 45_000 },
      ],
    },
    { id: expect.any(String), ...morning, rates: [] },
  ]);
  const rows = await env.db.select().from(daycareSessionType).where(eq(daycareSessionType.branchId, env.base.branchId));
  expect(rows.find((r) => r.session === "full_day")).toMatchObject({
    organizationId: env.base.orgId,
    nameTh: "เต็มวัน",
    startsAt: "08:00:00",
    endsAt: "18:00:00",
    capacity: 12,
    status: "active",
  });
  const rates = await env.db
    .select()
    .from(daycareRate)
    .where(eq(daycareRate.sessionTypeId, body[0]?.id ?? ""));
  expect(rates.map((r) => ({ plan: r.ratePlanId, org: r.organizationId, tier: r.sizeTierId, price: r.priceSatang }))).toEqual(
    expect.arrayContaining([
      { plan: ids.plan, org: env.base.orgId, tier: null, price: 50_000 },
      { plan: ids.plan, org: env.base.orgId, tier: ids.tier, price: 45_000 },
    ]),
  );
});

it("updates by id; sent rates replace the prices, omitted rates keep them, unsent sessions are untouched", async () => {
  const [created, kept] = await upsert([
    { ...full, rates: [{ priceSatang: 50_000 }] },
    { ...morning, rates: [{ priceSatang: 30_000 }] },
  ]);
  const updated = await upsert([
    { ...full, id: created?.id, nameTh: "ทั้งวัน", capacity: 20, status: "archived", rates: [{ sizeTierId: ids.tier, priceSatang: 40_000 }] },
  ]);
  expect(updated.find((t) => t.id === created?.id)).toMatchObject({
    nameTh: "ทั้งวัน",
    capacity: 20,
    status: "archived",
    rates: [{ sizeTierId: ids.tier, priceSatang: 40_000 }],
  });
  expect(updated.find((t) => t.id === kept?.id)).toMatchObject({ rates: [{ sizeTierId: null, priceSatang: 30_000 }] });
  const again = await upsert([{ ...full, id: created?.id, capacity: 15 }]);
  expect(again.find((t) => t.id === created?.id)).toMatchObject({ capacity: 15, rates: [{ sizeTierId: ids.tier, priceSatang: 40_000 }] });
  const [row] = await env.db
    .select()
    .from(daycareSessionType)
    .where(eq(daycareSessionType.id, created?.id ?? ""));
  expect(row).toMatchObject({ createdAt: TEST_NOW, updatedAt: TEST_NOW });
  const cleared = await upsert([{ ...full, id: created?.id, rates: [] }]);
  expect(cleared.find((t) => t.id === created?.id)?.rates).toEqual([]);
});

it("moves an existing row to a free session, but rejects a duplicate or swapped session", async () => {
  const [a, b] = await upsert([full, morning]);
  const moved = await upsert([
    { ...morning, id: b?.id, session: "afternoon" },
    { ...morning, nameTh: "เช้าใหม่" },
  ]);
  expect(moved.map((t) => t.session)).toEqual(["full_day", "morning", "afternoon"]);
  // a new row for a session that another (unsent) row holds
  await expect(upsert([{ ...full, nameTh: "ซ้ำ" }])).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
    details: { fields: { "items.0.session": expect.any(String) } },
  });
  // swapping two existing rows in one request
  await expect(
    upsert([
      { ...full, id: a?.id, session: "afternoon" },
      { ...full, id: b?.id, session: "full_day" },
    ]),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const items of [
    [{ ...full, session: undefined }],
    [{ ...full, session: "night" }],
    [{ ...full, nameTh: "  " }],
    [{ ...full, startsAt: "8:00" }],
    [{ ...full, endsAt: "24:00" }],
    [{ ...full, endsAt: "08:00" }],
    [{ ...full, capacity: 0 }],
    [{ ...full, capacity: 201 }],
    [{ ...full, capacity: 1.5 }],
    [{ ...full, status: "deleted" }],
    [{ ...full, id: "x" }],
    [{ ...full, rates: [{ priceSatang: -1 }] }],
    [{ ...full, rates: [{ priceSatang: 1.5 }] }],
    [{ ...full, rates: [{}] }],
    [{ ...full, rates: [{ priceSatang: 1 }, { priceSatang: 2 }] }],
    [full, { ...morning, session: "full_day" }],
  ]) {
    const response = await put({ items });
    expect(response.status, JSON.stringify(items)).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await put({})).status).toBe(422);
  expect(await env.db.select().from(daycareSessionType).where(eq(daycareSessionType.branchId, env.base.branchId))).toEqual([]);
});

it.each(["front_desk", "staff"] as const)("denies %s", async (role) => {
  const response = await put({ items: [full] }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("denies customer actors", async () => {
  await expect(daycareTypesUpsert(customerCtx(env.base), { items: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's branch, session or size tier without writing", async () => {
  for (const branchId of [foreign.branchId, null])
    await expect(daycareTypesUpsert({ ...owner(), branchId }, { items: [full] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(upsert([{ ...full, id: ids.foreignSession, nameTh: "ยึด" }])).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(upsert([{ ...full, rates: [{ sizeTierId: ids.foreignTier, priceSatang: 1 }] }])).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await env.db.select().from(daycareSessionType).where(eq(daycareSessionType.branchId, env.base.branchId))).toEqual([]);
  const [fs] = await env.db.select().from(daycareSessionType).where(eq(daycareSessionType.id, ids.foreignSession));
  expect(fs?.nameTh).toBe("เต็มวัน");
});
