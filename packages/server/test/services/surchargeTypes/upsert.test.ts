import { SurchargeTypesUpsertRequest, SurchargeTypesUpsertResponse } from "@app/contracts/endpoints/surchargeTypes.upsert";
import { branch, surchargeType } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { surchargeTypesUpsert } from "../../../src/services/surchargeTypes/upsert.ts";
import { customerCtx, seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const item = { nameTh: "Extra care", defaultAmountSatang: 12345, status: "active" as const };
const PUT = withStaff("surchargeTypes.upsert", { body: SurchargeTypesUpsertRequest }, surchargeTypesUpsert);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(surchargeType);
  resetRateLimits();
});
async function put(body: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request("https://petbooking.test/api/v1/staff/surcharge-types", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
  );
}
it("creates and updates only submitted surcharge types using ctx.now", async () => {
  const ctx = staffCtx(env.base, "owner");
  const saved = SurchargeTypesUpsertResponse.parse(await surchargeTypesUpsert(ctx, { items: [item] }));
  expect(saved).toEqual([{ id: expect.any(String), ...item }]);
  const [created] = await env.db.select().from(surchargeType);
  expect(created).toMatchObject({
    ...item,
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
  const later = new Date("2026-10-06T03:00:00.000Z");
  const updated = await surchargeTypesUpsert(
    { ...ctx, now: later },
    {
      items: [
        { ...item, id: created?.id, nameTh: "Updated", defaultAmountSatang: 0, status: "archived" },
        { ...item, nameTh: "Another charge" },
      ],
    },
  );
  const rows = await env.db.select().from(surchargeType);
  expect(SurchargeTypesUpsertResponse.parse(updated)).toEqual([
    { id: created?.id, nameTh: "Updated", defaultAmountSatang: 0, status: "archived" },
    { id: expect.any(String), ...item, nameTh: "Another charge" },
  ]);
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.id === created?.id)).toMatchObject({
    nameTh: "Updated",
    defaultAmountSatang: 0,
    status: "archived",
    createdAt: TEST_NOW,
    updatedAt: later,
  });
  await surchargeTypesUpsert(ctx, { items: [] });
  expect(await env.db.select().from(surchargeType)).toHaveLength(2);
});
it("accepts a 60-character name and zero integer satang without converting units", async () => {
  const boundary = { ...item, nameTh: "x".repeat(60), defaultAmountSatang: 0 };
  const response = await put({ items: [boundary, item] });
  expect(response.status).toBe(200);
  const body = SurchargeTypesUpsertResponse.parse(await response.json());
  expect(body.map(({ defaultAmountSatang }) => defaultAmountSatang)).toEqual([0, 12345]);
  expect(body[0]?.nameTh).toHaveLength(60);
  const rows = await env.db.select().from(surchargeType);
  expect(rows.map(({ defaultAmountSatang }) => defaultAmountSatang)).toEqual([0, 12345]);
});
it("returns exact saved DTOs from the route", async () => {
  const response = await put({ items: [item] });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(SurchargeTypesUpsertResponse.parse(body)).toEqual([{ id: expect.any(String), ...item }]);
  expect(body).toEqual(SurchargeTypesUpsertResponse.parse(body));
});
it("rejects every malformed required field before writing", async () => {
  for (const body of [
    {},
    { items: {} },
    ...[
      {},
      { ...item, nameTh: "" },
      { ...item, nameTh: "x".repeat(61) },
      { ...item, defaultAmountSatang: 1.5 },
      { ...item, defaultAmountSatang: -1 },
      { defaultAmountSatang: 10, status: "active" },
      { nameTh: "x", status: "active" },
      { nameTh: "x", defaultAmountSatang: 0 },
      { ...item, status: "unknown" },
      { ...item, id: "invalid" },
    ].map((invalid) => ({ items: [item, invalid] })),
  ]) {
    const response = await put(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await env.db.select().from(surchargeType)).toHaveLength(0);
});
it.each(["front_desk", "staff"] as const)("denies %s without writing", async (role) => {
  const response = await put({ items: [item] }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(await env.db.select().from(surchargeType)).toHaveLength(0);
});
it("denies absent sessions and customer actors", async () => {
  expect((await PUT(new Request("https://petbooking.test/api/v1/staff/surcharge-types", { method: "PUT" }))).status).toBe(401);
  await expect(surchargeTypesUpsert(customerCtx(env.base), { items: [item] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rolls back the entire batch for foreign, other-branch or missing item IDs", async () => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  const [second] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: "second-upsert" })
    .returning();
  const rows = await env.db
    .insert(surchargeType)
    .values([
      { ...item, organizationId: foreign.orgId, branchId: foreign.branchId },
      { ...item, organizationId: env.base.orgId, branchId: second?.id ?? "" },
      { ...item, organizationId: env.base.orgId, branchId: env.base.branchId },
    ])
    .returning();
  for (const id of [rows[0]?.id, rows[1]?.id, "00000000-0000-4000-8000-000000000000"]) {
    const response = await put({ items: [item, { ...item, id: rows[2]?.id, nameTh: "Changed" }, { ...item, id }] });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(await env.db.select().from(surchargeType)).toEqual(rows);
  }
});
it("rejects a foreign or absent branch before creating", async () => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  for (const branchId of [foreign.branchId, null]) {
    await expect(surchargeTypesUpsert({ ...staffCtx(env.base, "owner"), branchId }, { items: [item] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  expect(await env.db.select().from(surchargeType).where(eq(surchargeType.organizationId, env.base.orgId))).toHaveLength(0);
});
