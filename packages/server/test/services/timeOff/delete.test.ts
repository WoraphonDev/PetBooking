import { TimeOffDeleteRequest, TimeOffDeleteResponse } from "@app/contracts/endpoints/timeOff.delete";
import { staffTimeOff } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { timeOffDelete } from "../../../src/services/timeOff/delete.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const DELETE = withStaff("timeOff.delete", { params: TimeOffDeleteRequest }, timeOffDelete);
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  await env.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await env.db.delete(staffTimeOff);
  resetRateLimits();
});
async function seedTimeOff(org: SeedOrg = env.base) {
  const [row] = await env.db
    .insert(staffTimeOff)
    .values({
      organizationId: org.orgId,
      staffUserId: org.staff.staff,
      startsAt: new Date("2026-10-06T02:00:00.000Z"),
      endsAt: new Date("2026-10-06T05:00:00.000Z"),
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    })
    .returning();
  if (!row) throw new Error("seed failed");
  return row.id;
}
async function del(timeOffId: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return DELETE(
    new Request(`https://petbooking.test/api/v1/staff/time-off/${timeOffId}`, {
      method: "DELETE",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: Promise.resolve({ timeOffId }) },
  );
}

it.each(["owner", "front_desk"] as const)("deletes only the given time off for %s and returns empty 204", async (role) => {
  const target = await seedTimeOff();
  const kept = await seedTimeOff();
  const response = await del(target, role);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(TimeOffDeleteResponse.safeParse(undefined).success).toBe(true);
  expect((await env.db.select().from(staffTimeOff)).map((r) => r.id)).toEqual([kept]);
});

it("rejects a malformed timeOffId", async () => {
  const response = await del("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("returns NOT_FOUND for an unknown or already deleted time off", async () => {
  const id = await seedTimeOff();
  expect((await del(id)).status).toBe(204);
  const response = await del(id);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

it("denies the staff role, absent sessions and customer actors", async () => {
  const id = await seedTimeOff();
  const response = await del(id, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  const anonymous = await DELETE(new Request(`https://petbooking.test/api/v1/staff/time-off/${id}`, { method: "DELETE" }), {
    params: { timeOffId: id },
  });
  expect(anonymous.status).toBe(401);
  await expect(timeOffDelete(customerCtx(env.base), { timeOffId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(staffTimeOff)).toHaveLength(1);
});

it("returns NOT_FOUND for another organization's time off", async () => {
  const foreign = await otherOrg(env.db);
  const foreignId = await seedTimeOff(foreign);
  await expect(timeOffDelete(staffCtx(env.base, "owner"), { timeOffId: foreignId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await env.db.select().from(staffTimeOff)).toHaveLength(1);
});
