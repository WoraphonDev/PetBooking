import { ClosuresDeleteRequest, ClosuresDeleteResponse } from "@app/contracts/endpoints/closures.delete";
import { branchClosure } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { closuresDelete } from "../../../src/services/closures/delete.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const DELETE = withStaff("closures.delete", { params: ClosuresDeleteRequest }, closuresDelete);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(branchClosure);
  resetRateLimits();
});
async function seedClosure(branchId = env.base.branchId) {
  const [row] = await env.db
    .insert(branchClosure)
    .values({
      branchId,
      startsAt: new Date("2026-10-06T02:00:00.000Z"),
      endsAt: new Date("2026-10-06T05:00:00.000Z"),
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    })
    .returning();
  if (!row) throw new Error("seed failed");
  return row.id;
}
async function del(closureId: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return DELETE(
    new Request(`https://petbooking.test/api/v1/staff/branch/closures/${closureId}`, {
      method: "DELETE",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: Promise.resolve({ closureId }) },
  );
}

it.each(["owner", "front_desk"] as const)("deletes only the given closure for %s and returns empty 204", async (role) => {
  const target = await seedClosure();
  const kept = await seedClosure();
  const response = await del(target, role);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(ClosuresDeleteResponse.safeParse(undefined).success).toBe(true);
  expect((await env.db.select().from(branchClosure)).map((r) => r.id)).toEqual([kept]);
});

it("rejects a malformed closureId", async () => {
  const response = await del("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("returns NOT_FOUND for an unknown or already deleted closure", async () => {
  const id = await seedClosure();
  expect((await del(id)).status).toBe(204);
  const response = await del(id);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

it("denies the staff role, absent sessions and customer actors", async () => {
  const id = await seedClosure();
  const response = await del(id, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  const anonymous = await DELETE(new Request(`https://petbooking.test/api/v1/staff/branch/closures/${id}`, { method: "DELETE" }), {
    params: { closureId: id },
  });
  expect(anonymous.status).toBe(401);
  await expect(closuresDelete(customerCtx(env.base), { closureId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(branchClosure)).toHaveLength(1);
});

it("returns NOT_FOUND for another organization's closure or branch", async () => {
  const foreign = await otherOrg(env.db);
  const foreignClosure = await seedClosure(foreign.branchId);
  const own = await seedClosure();
  await expect(closuresDelete(staffCtx(env.base, "owner"), { closureId: foreignClosure })).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const branchId of [foreign.branchId, null]) {
    await expect(closuresDelete({ ...staffCtx(env.base, "owner"), branchId }, { closureId: own })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  expect(await env.db.select().from(branchClosure)).toHaveLength(2);
});
