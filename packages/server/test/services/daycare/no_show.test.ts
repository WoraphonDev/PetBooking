import { DaycareNoShowParams, DaycareNoShowRequest, DaycareNoShowResponse } from "@app/contracts/endpoints/daycare.no_show";
import { auditLog, booking, bookingEvent, customer, daycareSessionType, daycareVisit, notification, pet } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { daycareNoShow } from "../../../src/services/daycare/no_show.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("daycare.no_show", { body: DaycareNoShowRequest, params: DaycareNoShowParams }, daycareNoShow);
const DAY = 86_400_000;
/** branch local date `days` from the real clock (the route uses it as ctx.now) */
const localDay = (days: number) => toLocalDate({ instant: new Date(Date.now() + days * DAY).toISOString(), timezone: "Asia/Bangkok" });
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
beforeEach(async () => {
  resetRateLimits();
  await env.db.update(customer).set({ noShowCount12m: 0, reliabilityLevel: 3 }).where(eq(customer.id, env.base.customerId));
});

/** a confirmed booking with `visits` daycare visits on `visitDate` (default yesterday); the first one has `status` */
async function seedBooking(
  opts: { visits?: number; status?: typeof daycareVisit.$inferInsert.status; visitDate?: string; deposit?: number } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const deposit = opts.deposit ?? 0;
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      depositRequiredSatang: deposit,
      depositVerifiedSatang: deposit,
      depositStatus: deposit > 0 ? "verified" : "not_required",
      policySnapshot: {},
      firstServiceAt: new Date(Date.now() - DAY),
    })
    .returning();
  const ids: string[] = [];
  for (let i = 0; i < (opts.visits ?? 1); i++) {
    const [p] = await env.db
      .insert(pet)
      .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
      .returning();
    const [v] = await env.db
      .insert(daycareVisit)
      .values({
        ...tenant,
        bookingId: bk?.id ?? "",
        petId: p?.id ?? "",
        sessionTypeId: sessions.get(org.orgId) ?? "",
        visitDate: opts.visitDate ?? localDay(-1),
        priceSatang: 30_000,
        status: i === 0 ? (opts.status ?? "reserved") : "reserved",
      })
      .returning();
    ids.push(v?.id ?? "");
  }
  return { bookingId: bk?.id ?? "", visitIds: ids };
}
async function noShow(id: string, body: unknown = {}, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/daycare-visits/${id}/no-show`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { visitId: id } },
  );
}
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; details?: unknown } }).error;
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];

it("after session start + grace: visit no_show with reason, audit, R-09; the booking stays open with another visit", async () => {
  const b = await seedBooking({ visits: 2 });
  const [first = "", second = ""] = b.visitIds;
  const res = await noShow(first, { reason: "ไม่มาตามนัด" });
  expect(res.status).toBe(200);
  expect(DaycareNoShowResponse.parse(await res.json())).toMatchObject({ id: first, status: "no_show" });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, first));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus, e.reason])).toEqual([
    ["daycare_visit", "reserved", "no_show", "ไม่มาตามนัด"],
  ]);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, first));
  expect(audit).toMatchObject({ action: "booking.no_show", entityType: "daycare_visit", reason: "ไม่มาตามนัด" });
  const [c] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  expect(c).toMatchObject({ noShowCount12m: 1, reliabilityLevel: 2 });
  expect(await bookingRow(b.bookingId)).toMatchObject({ status: "confirmed" });
  expect((await env.db.select().from(daycareVisit).where(eq(daycareVisit.id, second)))[0]?.status).toBe("reserved");
  // 07 §1 customer.no_show is for grooming and hotel only
  expect(
    await env.db
      .select()
      .from(notification)
      .where(eq(notification.dedupeKey, `no_show:${first}:${env.base.customerId}`)),
  ).toEqual([]);
});

it("the last visit: booking closed, verified deposit forfeited", async () => {
  const b = await seedBooking({ deposit: 20_000 });
  expect((await noShow(b.visitIds[0] ?? "")).status).toBe(200);
  expect(await bookingRow(b.bookingId)).toMatchObject({ status: "closed", depositStatus: "forfeited" });
});

it("before session start + grace → STATUS_NOT_ALLOWED {allowedFrom}", async () => {
  const b = await seedBooking({ visitDate: localDay(1) });
  const error = await errorOf(await noShow(b.visitIds[0] ?? ""));
  expect(error).toMatchObject({ code: "STATUS_NOT_ALLOWED", details: { allowedFrom: expect.stringMatching(/T01:30:00\.000Z$/) } });
});

it.each(["checked_in", "checked_out", "cancelled", "no_show"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect((await errorOf(await noShow((await seedBooking({ visits: 2, status })).visitIds[0] ?? ""))).code).toBe("INVALID_TRANSITION");
});

it("bad body → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const b = await seedBooking();
  expect((await errorOf(await noShow(b.visitIds[0] ?? "", { reason: 5 }))).code).toBe("VALIDATION_FAILED");
  expect((await errorOf(await noShow(b.visitIds[0] ?? "", {}, "staff"))).code).toBe("FORBIDDEN");
  expect((await errorOf(await noShow((await seedBooking({}, other)).visitIds[0] ?? ""))).code).toBe("NOT_FOUND");
});
