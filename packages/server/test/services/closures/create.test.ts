import { ClosuresCreateRequest, ClosuresCreateResponse } from "@app/contracts/endpoints/closures.create";
import { branchClosure } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { closuresCreate } from "../../../src/services/closures/create.ts";
import { customerCtx, otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const body = { startsAt: "2026-10-06T02:00:00.000Z", endsAt: "2026-10-06T05:00:00.000Z", scope: "grooming", reason: "ปิดซ่อมแอร์" } as const;
const POST = withStaff("closures.create", { body: ClosuresCreateRequest }, closuresCreate);
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
async function post(input: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/branch/closures", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}

it.each(["owner", "front_desk"] as const)("stores a manual closure for %s and returns empty 204", async (role) => {
  const response = await post(body, role);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(ClosuresCreateResponse.safeParse(undefined).success).toBe(true);
  const rows = await env.db.select().from(branchClosure);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    branchId: env.base.branchId,
    scope: "grooming",
    source: "manual",
    reason: "ปิดซ่อมแอร์",
    createdBy: env.base.staff[role],
  });
  expect(rows[0]?.startsAt.toISOString()).toBe(body.startsAt);
  expect(rows[0]?.endsAt.toISOString()).toBe(body.endsAt);
});

it("stores a null reason when omitted and stamps ctx.now", async () => {
  await closuresCreate(staffCtx(env.base, "owner"), { startsAt: body.startsAt, endsAt: body.endsAt, scope: "all" });
  const [row] = await env.db.select().from(branchClosure);
  expect(row).toMatchObject({ scope: "all", reason: null, createdAt: TEST_NOW, updatedAt: TEST_NOW });
});

it("rejects missing and malformed fields before writing", async () => {
  for (const invalid of [
    {},
    { ...body, startsAt: undefined },
    { ...body, endsAt: "2026-10-06" },
    { ...body, endsAt: body.startsAt },
    { ...body, endsAt: "2026-10-06T01:00:00.000Z" },
    { ...body, scope: "spa" },
    { ...body, reason: "ก".repeat(201) },
  ]) {
    const response = await post(invalid);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  expect((await post({ ...body, reason: "ก".repeat(200) })).status).toBe(204);
});

it("denies the staff role, absent sessions and customer actors", async () => {
  const response = await post(body, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect((await POST(new Request("https://petbooking.test/api/v1/staff/branch/closures", { method: "POST" }))).status).toBe(401);
  await expect(closuresCreate(customerCtx(env.base), { ...body })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await env.db.select().from(branchClosure)).toHaveLength(0);
});

it("returns NOT_FOUND for another organization's branch and an absent branch", async () => {
  const foreign = await otherOrg(env.db);
  for (const branchId of [foreign.branchId, null]) {
    await expect(closuresCreate({ ...staffCtx(env.base, "owner"), branchId }, { ...body })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await env.db.select().from(branchClosure)).toHaveLength(0);
});
