import { StaffUsersListQuery, StaffUsersListResponse } from "@app/contracts/endpoints/staffUsers.list";
import { staffUser, staffWorkingHours } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { staffUsersList } from "../../../src/services/staffUsers/list.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("staffUsers.list", { query: StaffUsersListQuery }, staffUsersList);
let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function call(
  method: string,
  url: string,
  params: Record<string, string>,
  body: unknown,
  role: "owner" | "front_desk" | "staff" = "owner",
  org: SeedOrg = env.base,
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test${url}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const list = async (role: "owner" | "front_desk" | "staff" = "owner") => {
  const res = await call("GET", "/api/v1/staff/staff-users", {}, undefined, role);
  expect(res.status).toBe(200);
  return StaffUsersListResponse.parse(await res.json());
};

it("owner / front_desk see every field of this organization's staff, ordered, with working hours", async () => {
  await env.db.update(staffUser).set({ sortOrder: 9 }).where(eq(staffUser.id, env.base.staff.owner));
  await env.db.insert(staffWorkingHours).values({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    staffUserId: env.base.staff.staff,
    weekday: 1,
    startsAt: "09:00",
    endsAt: "18:00",
    breakStartsAt: "12:00",
    breakEndsAt: "13:00",
  });
  for (const role of ["owner", "front_desk"] as const) {
    const items = await list(role);
    expect(items.map((i) => i.id)).toEqual([env.base.staff.front_desk, env.base.staff.staff, env.base.staff.owner]);
    expect(items[1]).toMatchObject({
      displayName: "staff",
      email: expect.stringContaining("@"),
      role: "staff",
      status: "active",
      lineLinked: false,
      lastLoginAt: null,
      photoUrl: null,
      workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "18:00", breakStartsAt: "12:00", breakEndsAt: "13:00" }],
    });
    expect(items.map((i) => i.id)).not.toContain(other.staff.owner);
  }
});

it("role staff sees only id, displayName, isGroomer, photoUrl", async () => {
  const items = await list("staff");
  expect(items).toHaveLength(3);
  for (const item of items) expect(Object.keys(item).sort()).toEqual(["displayName", "id", "isGroomer", "photoUrl"]);
});

it("a query parameter → VALIDATION_FAILED", async () => {
  expect(await codeOf(await call("GET", "/api/v1/staff/staff-users?x=1", {}, undefined))).toBe("VALIDATION_FAILED");
  void and;
});
