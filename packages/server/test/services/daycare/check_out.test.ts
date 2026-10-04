import { DaycareCheckOutParams, DaycareCheckOutResponse } from "@app/contracts/endpoints/daycare.check_out";
import { bill, billLine, booking, bookingEvent, daycareSessionType, daycareVisit, pet } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { daycareCheckOut } from "../../../src/services/daycare/check_out.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("daycare.check_out", { params: DaycareCheckOutParams }, daycareCheckOut);
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
async function call(path: "check-in" | "check-out", id: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/daycare-visits/${id}/${path}`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: { visitId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const visitRow = async (id: string) => (await env.db.select().from(daycareVisit).where(eq(daycareVisit.id, id)))[0];
const linesOf = async (billId: string) => env.db.select().from(billLine).where(eq(billLine.billId, billId));

it("checked_in → checked_out with checked_out_at and booking_event; no bill yet → nothing billed", async () => {
  const v = await seedVisit({ status: "checked_in" });
  const item = DaycareCheckOutResponse.parse(await daycareCheckOut(staffCtx(env.base, "front_desk"), { visitId: v.id }));
  expect(item).toMatchObject({ id: v.id, status: "checked_out", checkedOutAt: TEST_NOW.toISOString() });
  expect(await visitRow(v.id)).toMatchObject({ status: "checked_out", checkedOutAt: TEST_NOW });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, v.id));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual([["daycare_visit", "checked_in", "checked_out"]]);
});

it("an open bill gets a daycare line and new totals", async () => {
  const v = await seedVisit({ status: "checked_in", bill: "open" });
  await daycareCheckOut(staffCtx(env.base, "owner"), { visitId: v.id });
  expect(await linesOf(v.billId)).toEqual([
    expect.objectContaining({
      refType: "daycare_visit",
      refId: v.id,
      petId: v.petId,
      lineType: "daycare",
      description: "เต็มวัน",
      quantity: 1,
      unitPriceSatang: 30_000,
      lineTotalSatang: 30_000,
    }),
  ]);
  expect((await env.db.select().from(bill).where(eq(bill.id, v.billId)))[0]).toMatchObject({ subtotalSatang: 30_000, totalSatang: 30_000 });
});

it("a bill that already has the visit's line is left alone", async () => {
  const v = await seedVisit({ status: "checked_in", bill: "paid" });
  await env.db.insert(billLine).values({
    organizationId: env.base.orgId,
    billId: v.billId,
    refType: "daycare_visit",
    refId: v.id,
    petId: v.petId,
    lineType: "daycare",
    description: "เต็มวัน",
    unitPriceSatang: 10_000,
    lineTotalSatang: 10_000,
  });
  expect((await daycareCheckOut(staffCtx(env.base, "owner"), { visitId: v.id })).status).toBe("checked_out");
  expect(await linesOf(v.billId)).toHaveLength(1);
});

it.each(["paid", "void"] as const)("a %s bill without the visit → STATUS_NOT_ALLOWED, still checked in", async (status) => {
  const v = await seedVisit({ status: "checked_in", bill: status });
  await expect(daycareCheckOut(staffCtx(env.base, "owner"), { visitId: v.id })).rejects.toMatchObject({ code: "STATUS_NOT_ALLOWED" });
  expect((await visitRow(v.id))?.status).toBe("checked_in");
});

it.each(["reserved", "checked_out", "cancelled", "no_show"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  const v = await seedVisit({ status });
  await expect(daycareCheckOut(staffCtx(env.base, "front_desk"), { visitId: v.id })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
});

it("bad id → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await call("check-out", "nope"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await call("check-out", (await seedVisit({ status: "checked_in" })).id, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await call("check-out", (await seedVisit({ status: "checked_in" }, other)).id))).toBe("NOT_FOUND");
});
