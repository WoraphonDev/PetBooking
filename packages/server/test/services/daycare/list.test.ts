import { DaycareListQuery, DaycareListResponse } from "@app/contracts/endpoints/daycare.list";
import { bill, booking, daycareSessionType, daycareVisit, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { daycareList } from "../../../src/services/daycare/list.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("daycare.list", { query: DaycareListQuery }, daycareList);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
const sessions = new Map<string, string>();
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) {
    const [s] = await env.db
      .insert(daycareSessionType)
      .values({
        organizationId: org.orgId,
        branchId: org.branchId,
        session: "full_day",
        nameTh: "เต็มวัน",
        startsAt: "08:00",
        endsAt: "18:00",
        capacity: 10,
      })
      .returning();
    sessions.set(org.orgId, s?.id ?? "");
  }
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

/** a confirmed booking with one daycare visit on `visitDate` in `status` (and optionally a bill) */
async function seedVisit(
  opts: { visitDate?: string; status?: typeof daycareVisit.$inferInsert.status; bill?: "open" | "paid" | "void" } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [b] = opts.bill
    ? await env.db
        .insert(bill)
        .values({
          ...tenant,
          customerId: org.customerId,
          openedBy: org.staff.owner,
          status: opts.bill,
          subtotalSatang: 10_000,
          totalSatang: 10_000,
          paidSatang: opts.bill === "paid" ? 10_000 : 0,
        })
        .returning()
    : [];
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      billId: b?.id ?? null,
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${seq}`, species: "dog" })
    .returning();
  const [v] = await env.db
    .insert(daycareVisit)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      sessionTypeId: sessions.get(org.orgId) ?? "",
      visitDate: opts.visitDate ?? "2026-10-05",
      priceSatang: 30_000,
      status: opts.status ?? "reserved",
      checkedInAt: opts.status === "checked_in" ? new Date("2026-10-05T01:00:00Z") : null,
    })
    .returning();
  return { id: v?.id ?? "", petId: p?.id ?? "", bookingId: bk?.id ?? "", billId: b?.id ?? "" };
}
async function list(query: string) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.staff, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(new Request(`https://petbooking.test/api/v1/staff/daycare-visits${query}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: {},
  });
}

it("lists this branch's visits on the date (role staff), cancelled ones left out", async () => {
  const [early] = await env.db
    .insert(daycareSessionType)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      session: "morning",
      nameTh: "ครึ่งเช้า",
      startsAt: "07:00",
      endsAt: "12:00",
      capacity: 5,
    })
    .returning();
  const full = await seedVisit({ visitDate: "2026-10-12" });
  const am = await seedVisit({ visitDate: "2026-10-12", status: "checked_in" });
  await env.db
    .update(daycareVisit)
    .set({ sessionTypeId: early?.id ?? "" })
    .where(eq(daycareVisit.id, am.id));
  const cancelled = await seedVisit({ visitDate: "2026-10-12", status: "cancelled" });
  await seedVisit({ visitDate: "2026-10-13" });
  const foreign = await seedVisit({ visitDate: "2026-10-12" }, other);

  const res = await list("?date=2026-10-12");
  expect(res.status).toBe(200);
  const items = DaycareListResponse.parse(await res.json());
  expect(items.map((i) => [i.id, i.sessionName, i.status])).toEqual([
    [am.id, "ครึ่งเช้า", "checked_in"],
    [full.id, "เต็มวัน", "reserved"],
  ]);
  expect(items[1]).toMatchObject({
    bookingId: full.bookingId,
    visitDate: "2026-10-12",
    priceSatang: 30_000,
    checkedInAt: null,
    checkedOutAt: null,
  });
  expect(items.map((i) => i.id)).not.toContain(cancelled.id);
  expect(items.map((i) => i.id)).not.toContain(foreign.id);
});

it("a day without visits → []", async () => {
  expect(DaycareListResponse.parse(await (await list("?date=2027-01-01")).json())).toEqual([]);
});

it.each([
  ["missing date", ""],
  ["bad date", "?date=12-10-2026"],
  ["unknown parameter", "?date=2026-10-12&status=reserved"],
])("VALIDATION_FAILED: %s", async (_n, query) => {
  expect(((await (await list(query)).json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
});
