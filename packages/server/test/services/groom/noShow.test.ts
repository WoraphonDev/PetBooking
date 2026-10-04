import { GroomNoShowParams, GroomNoShowRequest, GroomNoShowResponse } from "@app/contracts/endpoints/groom.noShow";
import { auditLog, booking, bookingEvent, customer, groomAppointment, groomStation, notification, pet, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { groomNoShow } from "../../../src/services/groom/noShow.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("groom.noShow", { body: GroomNoShowRequest, params: GroomNoShowParams }, groomNoShow);
const MINUTE = 60_000;
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db
    .update(customer)
    .set({ noShowCount12m: 0, lateCancelCount12m: 0, reliabilityLevel: 3 })
    .where(eq(customer.id, env.base.customerId));
});

type BookingValues = Partial<typeof booking.$inferInsert>;
async function seedBooking(values: BookingValues = {}, org: SeedOrg = env.base) {
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      customerId: org.customerId,
      bookingNo: `B6910-${++seq}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      ...values,
    })
    .returning();
  return bk?.id ?? "";
}
/** startsAt = minutesAgo before the real clock (the HTTP wrapper reads the clock) */
async function seedAppt(
  bookingId: string,
  minutesAgo: number,
  status: typeof groomAppointment.$inferInsert.status = "scheduled",
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "โมจิ", species: "dog" })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${++seq}` })
    .returning();
  // one groomer per appointment so the groomer exclusion constraint never trips
  const [groomer] = await env.db
    .insert(staffUser)
    .values({
      organizationId: org.orgId,
      email: `g${seq}@${org.orgId}.test`,
      displayName: `ช่าง ${seq}`,
      role: "staff",
      status: "active",
      isGroomer: true,
    })
    .returning();
  const startsAt = new Date(Date.now() - minutesAgo * MINUTE);
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId,
      petId: p?.id ?? "",
      groomerId: groomer?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * MINUTE),
      blockedUntil: new Date(startsAt.getTime() + 30 * MINUTE),
      status,
    })
    .returning();
  return a?.id ?? "";
}
async function post(id: string, body: unknown = { reason: "โทรไม่ติด" }, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/groom-appointments/${id}/no-show`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { appointmentId: id } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];
const customerRow = async () => (await env.db.select().from(customer).where(eq(customer.id, env.base.customerId)))[0];

it("the only pet does not come: no_show, audit, R-09, deposit forfeited, booking closed, customer.no_show with the deposit", async () => {
  const bookingId = await seedBooking({ depositRequiredSatang: 30_000, depositVerifiedSatang: 30_000, depositStatus: "verified" });
  const id = await seedAppt(bookingId, 45);
  const res = await post(id);
  expect(res.status).toBe(200);
  const card = GroomNoShowResponse.parse(await res.json());
  expect(card).toMatchObject({ id, status: "no_show", depositStatus: "forfeited" });
  expect(await bookingRow(bookingId)).toMatchObject({ status: "closed", depositStatus: "forfeited" });
  expect(await customerRow()).toMatchObject({ noShowCount12m: 1, reliabilityLevel: 2 });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bookingId));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus, e.reason])).toEqual([
    ["groom_appointment", "scheduled", "no_show", "โทรไม่ติด"],
    ["deposit", "verified", "forfeited", "โทรไม่ติด"],
    ["booking", "confirmed", "closed", "โทรไม่ติด"],
  ]);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, id));
  expect(audit).toMatchObject({ action: "booking.no_show", entityType: "groom_appointment", reason: "โทรไม่ติด" });
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `no_show:${id}:${env.base.customerId}`));
  expect(note).toMatchObject({ templateKey: "customer.no_show", recipientId: env.base.customerId });
  expect(note?.payload).toEqual({
    petName: "โมจิ",
    moneyLine: "มัดจำ ฿300 ถูกริบตามนโยบายร้าน",
    bookAgainUrl: "https://petbooking.test/liff/shop-a",
  });
});

it("one pet of two: the booking stays confirmed and the deposit untouched; the second no-show raises R-09 to level 1", async () => {
  const bookingId = await seedBooking({ depositRequiredSatang: 30_000, depositVerifiedSatang: 30_000, depositStatus: "verified" });
  const first = await seedAppt(bookingId, 60);
  const second = await seedAppt(bookingId, 40);
  expect((await post(first)).status).toBe(200);
  expect(await bookingRow(bookingId)).toMatchObject({ status: "confirmed", depositStatus: "verified" });
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `no_show:${first}:${env.base.customerId}`));
  expect(note?.payload).toMatchObject({ moneyLine: "" });
  expect((await post(second)).status).toBe(200);
  expect(await bookingRow(bookingId)).toMatchObject({ status: "closed", depositStatus: "forfeited" });
  expect(await customerRow()).toMatchObject({ noShowCount12m: 2, reliabilityLevel: 1 });
});

it("no deposit: the booking closes, deposit status unchanged, empty money line", async () => {
  const bookingId = await seedBooking();
  const id = await seedAppt(bookingId, 31);
  expect((await post(id, {})).status).toBe(200);
  expect(await bookingRow(bookingId)).toMatchObject({ status: "closed", depositStatus: "not_required" });
  const [ev] = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, id));
  expect(ev?.reason).toBeNull();
});

it("before starts_at + grace (30 min) → STATUS_NOT_ALLOWED with allowedFrom", async () => {
  const id = await seedAppt(await seedBooking(), 10);
  const res = await post(id);
  const body = (await res.json()) as { error: { code: string; details: { allowedFrom: string } } };
  expect(body.error.code).toBe("STATUS_NOT_ALLOWED");
  expect(Date.parse(body.error.details.allowedFrom)).toBeGreaterThan(Date.now());
  expect((await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, id)))[0]?.status).toBe("scheduled");
});

it.each(["checked_in", "done", "cancelled"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await post(await seedAppt(await seedBooking(), 60, status)))).toBe("INVALID_TRANSITION");
});

it("reason over 500 → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const id = await seedAppt(await seedBooking(), 60);
  expect(await codeOf(await post(id, { reason: "x".repeat(501) }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await post(id, undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await post(await seedAppt(await seedBooking({}, other), 60, "scheduled", other)))).toBe("NOT_FOUND");
});
