import { BranchSetModulesRequest, BranchSetModulesResponse } from "@app/contracts/endpoints/branch.setModules";
import { booking, branch, branchPolicy, daycareSessionType, daycareVisit, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { branchSetModules } from "../../../src/services/branch/setModules.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("branch.setModules", { body: BranchSetModulesRequest }, branchSetModules);
let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) await env.db.insert(branchPolicy).values({ branchId: org.branchId });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db.update(branch).set({ moduleGrooming: true, moduleHotel: true, moduleDaycare: true }).where(eq(branch.id, env.base.branchId));
});

async function patch(body: unknown, role: "owner" | "front_desk" | "staff" = "owner", org: SeedOrg = env.base) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return ROUTE(
    new Request("https://petbooking.test/api/v1/staff/branch/modules", {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: {} },
  );
}
const branchRow = async (id = env.base.branchId) => (await env.db.select().from(branch).where(eq(branch.id, id)))[0];

it("sets only the given flags; no future bookings → no warnings", async () => {
  const res = await patch({ grooming: false });
  expect(res.status).toBe(200);
  const body = BranchSetModulesResponse.parse(await res.json());
  expect(body.modules).toEqual({ grooming: false, hotel: true, daycare: true });
  expect(body.warnings).toEqual([]);
  expect(await branchRow()).toMatchObject({ moduleGrooming: false, moduleHotel: true, moduleDaycare: true });
});

it("switching off a module with future bookings is allowed and warns with the booking count; nothing is cancelled", async () => {
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
    .returning();
  const visits = [];
  for (const [i, visitDate] of ["2099-01-01", "2099-01-02", "2000-01-01"].entries()) {
    const [bk] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: env.base.customerId,
        bookingNo: `B-M${i}`,
        channel: "walk_in",
        createdByType: "staff",
        status: "confirmed",
        policySnapshot: {},
      })
      .returning();
    const [p] = await env.db
      .insert(pet)
      .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: `โมจิ${i}`, species: "dog" })
      .returning();
    const [v] = await env.db
      .insert(daycareVisit)
      .values({ ...tenant, bookingId: bk?.id ?? "", petId: p?.id ?? "", sessionTypeId: session?.id ?? "", visitDate, priceSatang: 30_000 })
      .returning();
    visits.push(v?.id);
  }
  const body = BranchSetModulesResponse.parse(await (await patch({ daycare: false, hotel: false })).json());
  expect(body.modules).toEqual({ grooming: true, hotel: false, daycare: false });
  expect(body.warnings).toEqual([
    { code: "MODULE_HAS_FUTURE_BOOKINGS", message: "ยังมีใบจองที่ค้างอยู่ 2 ใบ", data: { module: "daycare", bookingCount: 2 } },
  ]);
  const statuses = await env.db
    .select()
    .from(daycareVisit)
    .where(eq(daycareVisit.sessionTypeId, session?.id ?? ""));
  expect(statuses.every((v) => v.status === "reserved")).toBe(true);
  // already off → switching it off again does not warn
  expect(BranchSetModulesResponse.parse(await (await patch({ daycare: false })).json()).warnings).toEqual([]);
});

it("unknown field or non-boolean → VALIDATION_FAILED; front_desk / staff → FORBIDDEN; only the caller's branch changes", async () => {
  for (const body of [{ spa: true }, { grooming: "no" }])
    expect(((await (await patch(body)).json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  for (const role of ["front_desk", "staff"] as const)
    expect(((await (await patch({ hotel: false }, role)).json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  expect((await patch({ hotel: false }, "owner", other)).status).toBe(200);
  expect((await branchRow())?.moduleHotel).toBe(true);
  expect((await branchRow(other.branchId))?.moduleHotel).toBe(false);
});
