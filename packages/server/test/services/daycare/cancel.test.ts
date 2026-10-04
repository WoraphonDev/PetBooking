import { DaycareCancelParams, DaycareCancelRequest, DaycareCancelResponse } from "@app/contracts/endpoints/daycare.cancel";
import { booking, bookingEvent, daycareSessionType, daycareVisit, pet, scheduledJob } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { daycareCancel } from "../../../src/services/daycare/cancel.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("daycare.cancel", { body: DaycareCancelRequest, params: DaycareCancelParams }, daycareCancel);
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

/** a confirmed booking with `visits` daycare visits (300 บาท each); the first one has `status` */
async function seedBooking(visits = 2, status: typeof daycareVisit.$inferInsert.status = "reserved", org: SeedOrg = env.base) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
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
      estimatedTotalSatang: visits * 30_000,
    })
    .returning();
  const ids: string[] = [];
  for (let i = 0; i < visits; i++) {
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
        visitDate: "2026-11-05",
        priceSatang: 30_000,
        status: i === 0 ? status : "reserved",
      })
      .returning();
    ids.push(v?.id ?? "");
  }
  await env.db.insert(scheduledJob).values({
    organizationId: org.orgId,
    jobType: "reminder_24h",
    runAt: new Date(Date.UTC(2026, 10, 4, 1)),
    payload: { bookingId: bk?.id, entityType: "daycare_visit", entityId: ids[0] },
    dedupeKey: `reminder_24h:${ids[0]}:x`,
  });
  return { bookingId: bk?.id ?? "", visitIds: ids };
}
async function cancel(id: string, body: unknown = { reason: "น้องไม่สบาย" }, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/daycare-visits/${id}/cancel`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { visitId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("cancels one visit: DaycareVisitItem, event with reason, reminder cancelled, estimate lowered", async () => {
  const b = await seedBooking();
  const [first = ""] = b.visitIds;
  const res = await cancel(first);
  expect(res.status).toBe(200);
  expect(DaycareCancelResponse.parse(await res.json())).toMatchObject({
    id: first,
    bookingId: b.bookingId,
    status: "cancelled",
    sessionName: "เต็มวัน",
    priceSatang: 30_000,
  });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, first));
  expect(events.map((e) => [e.fromStatus, e.toStatus, e.reason])).toEqual([["reserved", "cancelled", "น้องไม่สบาย"]]);
  expect(
    (
      await env.db
        .select()
        .from(scheduledJob)
        .where(eq(scheduledJob.dedupeKey, `reminder_24h:${first}:x`))
    )[0]?.status,
  ).toBe("cancelled");
  expect((await env.db.select().from(booking).where(eq(booking.id, b.bookingId)))[0]?.estimatedTotalSatang).toBe(30_000);
});

it.each(["checked_in", "checked_out", "cancelled"] as const)("from %s → STATUS_NOT_ALLOWED", async (status) => {
  expect(await codeOf(await cancel((await seedBooking(2, status)).visitIds[0] ?? ""))).toBe("STATUS_NOT_ALLOWED");
});

it("the last active item → STATUS_NOT_ALLOWED with a bookings.cancel hint", async () => {
  const res = await cancel((await seedBooking(1)).visitIds[0] ?? "");
  expect(((await res.json()) as { error: { code: string; details: unknown } }).error).toMatchObject({
    code: "STATUS_NOT_ALLOWED",
    details: { hint: "bookings.cancel" },
  });
});

it("missing reason → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const b = await seedBooking();
  expect(await codeOf(await cancel(b.visitIds[0] ?? "", {}))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await cancel(b.visitIds[0] ?? "", undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await cancel((await seedBooking(2, "reserved", other)).visitIds[0] ?? ""))).toBe("NOT_FOUND");
});
