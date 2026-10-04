import { DaycareCheckInParams, DaycareCheckInResponse } from "@app/contracts/endpoints/daycare.check_in";
import { bill, booking, bookingEvent, branchPolicy, daycareSessionType, daycareVisit, pet, petVaccination } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { daycareCheckIn } from "../../../src/services/daycare/check_in.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("daycare.check_in", { params: DaycareCheckInParams }, daycareCheckIn);
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
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, requiredVaccinesDog: ["DOG_RABIES"] });
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
const vaccinate = (petId: string, expiresOn = "2027-01-01", status: "verified" | "pending_review" = "verified") =>
  env.db.insert(petVaccination).values({ petId, vaccineCode: "DOG_RABIES", expiresOn, status });

it("on the visit day with valid vaccines: checked_in, checked_in_at, booking_event", async () => {
  const v = await seedVisit();
  await vaccinate(v.petId);
  const item = DaycareCheckInResponse.parse(await daycareCheckIn(staffCtx(env.base, "front_desk"), { visitId: v.id }));
  expect(item).toMatchObject({
    id: v.id,
    bookingId: v.bookingId,
    status: "checked_in",
    checkedInAt: TEST_NOW.toISOString(),
    sessionName: "เต็มวัน",
  });
  expect(await visitRow(v.id)).toMatchObject({ status: "checked_in", checkedInAt: TEST_NOW });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, v.id));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus])).toEqual([["daycare_visit", "reserved", "checked_in"]]);
});

it.each([
  ["missing", undefined, undefined, { missing: ["DOG_RABIES"], expired: [], pendingReview: [] }],
  ["expired before the visit", "2026-10-04", "verified", { missing: [], expired: ["DOG_RABIES"], pendingReview: [] }],
  ["still pending review", "2027-01-01", "pending_review", { missing: [], expired: [], pendingReview: ["DOG_RABIES"] }],
] as const)("R-11 fails (%s) → VACCINE_REQUIRED, still reserved", async (_n, expiresOn, status, details) => {
  const v = await seedVisit();
  if (expiresOn && status) await vaccinate(v.petId, expiresOn, status);
  await expect(daycareCheckIn(staffCtx(env.base, "owner"), { visitId: v.id })).rejects.toMatchObject({ code: "VACCINE_REQUIRED", details });
  expect((await visitRow(v.id))?.status).toBe("reserved");
});

it.each(["2026-10-04", "2026-10-06"])("visit on %s (not today) → STATUS_NOT_ALLOWED", async (visitDate) => {
  const v = await seedVisit({ visitDate });
  await vaccinate(v.petId);
  await expect(daycareCheckIn(staffCtx(env.base, "front_desk"), { visitId: v.id })).rejects.toMatchObject({ code: "STATUS_NOT_ALLOWED" });
});

it.each(["checked_in", "checked_out", "cancelled", "no_show"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  const v = await seedVisit({ status });
  await expect(daycareCheckIn(staffCtx(env.base, "front_desk"), { visitId: v.id })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
});

it("bad id → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await call("check-in", "nope"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await call("check-in", (await seedVisit()).id, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await call("check-in", (await seedVisit({}, other)).id))).toBe("NOT_FOUND");
});
