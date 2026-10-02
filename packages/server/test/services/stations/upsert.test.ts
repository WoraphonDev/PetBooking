import { StationsUpsertRequest, StationsUpsertResponse } from "@app/contracts/endpoints/stations.upsert";
import { branch, groomStation } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { stationsUpsert } from "../../../src/services/stations/upsert.ts";
import { customerCtx, seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const station = { name: "Table 1", sortOrder: 2, status: "active" as const };
const PUT = withStaff("stations.upsert", { body: StationsUpsertRequest }, stationsUpsert);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(groomStation);
  resetRateLimits();
});
async function put(body: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PUT(
    new Request("https://petbooking.test/api/v1/staff/stations", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
  );
}
it("creates and updates only submitted stations using ctx.now", async () => {
  const ctx = staffCtx(env.base, "owner");
  expect(StationsUpsertResponse.parse(await stationsUpsert(ctx, { stations: [station] }))).toBeUndefined();
  const [created] = await env.db.select().from(groomStation);
  expect(created).toMatchObject({
    ...station,
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
  const later = new Date("2026-10-06T03:00:00.000Z");
  await stationsUpsert(
    { ...ctx, now: later },
    {
      stations: [
        { ...station, id: created?.id, name: "Updated", sortOrder: -1, status: "archived" },
        { ...station, name: "Table 2" },
      ],
    },
  );
  const rows = await env.db.select().from(groomStation);
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.id === created?.id)).toMatchObject({
    name: "Updated",
    sortOrder: -1,
    status: "archived",
    createdAt: TEST_NOW,
    updatedAt: later,
  });
  await stationsUpsert(ctx, { stations: [] });
  expect(await env.db.select().from(groomStation)).toHaveLength(2);
});
it("returns an empty 204 from the route", async () => {
  const response = await put({ stations: [station] });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
});
it("rejects every malformed required field before writing", async () => {
  for (const body of [
    {},
    { stations: {} },
    ...[
      {},
      { ...station, name: "" },
      { ...station, name: "x".repeat(31) },
      { ...station, sortOrder: 1.5 },
      { name: "x", status: "active" },
      { name: "x", sortOrder: 0 },
      { ...station, status: "unknown" },
      { ...station, id: "invalid" },
    ].map((item) => ({ stations: [station, item] })),
  ]) {
    const response = await put(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect(await env.db.select().from(groomStation)).toHaveLength(0);
});
it.each(["front_desk", "staff"] as const)("denies %s without writing", async (role) => {
  const response = await put({ stations: [station] }, role);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(await env.db.select().from(groomStation)).toHaveLength(0);
});
it("denies absent sessions and customer actors", async () => {
  expect((await PUT(new Request("https://petbooking.test/api/v1/staff/stations", { method: "PUT" }))).status).toBe(401);
  await expect(stationsUpsert(customerCtx(env.base), { stations: [station] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rolls back the entire batch for foreign, other-branch or missing station IDs", async () => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  const [second] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: "second-upsert" })
    .returning();
  const rows = await env.db
    .insert(groomStation)
    .values([
      { ...station, organizationId: foreign.orgId, branchId: foreign.branchId },
      { ...station, organizationId: env.base.orgId, branchId: second?.id ?? "" },
      { ...station, organizationId: env.base.orgId, branchId: env.base.branchId },
    ])
    .returning();
  for (const id of [rows[0]?.id, rows[1]?.id, "00000000-0000-4000-8000-000000000000"]) {
    const response = await put({ stations: [station, { ...station, id: rows[2]?.id, name: "Changed" }, { ...station, id }] });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(await env.db.select().from(groomStation)).toEqual(rows);
  }
});
it("rejects a foreign or absent branch before creating", async () => {
  const foreign = await seedOrg(env.db, `foreign-${crypto.randomUUID()}`);
  for (const branchId of [foreign.branchId, null]) {
    await expect(stationsUpsert({ ...staffCtx(env.base, "owner"), branchId }, { stations: [station] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  expect(await env.db.select().from(groomStation).where(eq(groomStation.organizationId, env.base.orgId))).toHaveLength(0);
});
