import { BookingsApproveParams, BookingsApproveResponse } from "@app/contracts/endpoints/bookings.approve";
import {
  booking,
  bookingEvent,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  notification,
  pet,
  scheduledJob,
  service,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsApprove } from "../../../src/services/bookings/approve.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("bookings.approve", { params: BookingsApproveParams }, bookingsApprove);
let env: TestEnv;
let other: SeedOrg;
let svc = "";
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const [s] = await env.db
    .insert(service)
    .values({ organizationId: env.base.orgId, branchId: env.base.branchId, nameTh: "อาบน้ำ", category: "bath" })
    .returning();
  svc = s?.id ?? "";
  for (const org of [other])
    await env.db.insert(service).values({ organizationId: org.orgId, branchId: org.branchId, nameTh: "x", category: "bath" });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

let seq = 0;
/** a booking (default awaiting approval) with one grooming appointment of its own groomer/station */
async function seedBooking(
  values: Partial<typeof booking.$inferInsert> = {},
  org: SeedOrg = env.base,
  startsAt = new Date(Date.now() + 3 * 86_400_000),
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `โมจิ${++seq}`, species: "dog" })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B6910-${String(seq).padStart(4, "0")}`,
      channel: "line_liff",
      createdByType: "customer",
      status: "awaiting_approval",
      policySnapshot: {},
      firstServiceAt: startsAt,
      estimatedTotalSatang: 60_000,
      ...values,
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
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
  const [a] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: p?.id ?? "",
      groomerId: groomer?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
    })
    .returning();
  await env.db.insert(groomAppointmentItem).values({
    organizationId: org.orgId,
    appointmentId: a?.id ?? "",
    serviceId: svc,
    nameSnapshot: "อาบน้ำ",
    priceSatang: 60_000,
    durationMinutes: 60,
  });
  return { id: bk?.id ?? "", apptId: a?.id ?? "", petName: p?.name ?? "" };
}
async function call(
  path: string,
  init: { method: string; body?: unknown },
  params: Record<string, string> = {},
  role: "owner" | "front_desk" | "staff" = "front_desk",
) {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/bookings${path}`, {
      method: init.method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];
const approve = (id: string, role: "owner" | "front_desk" | "staff" = "front_desk") =>
  call(`/${id}/approve`, { method: "POST" }, { bookingId: id }, role);

it("awaiting_approval → confirmed: confirmed_at, booking_event, approval_overdue cancelled, reminder_24h, booking_confirmed", async () => {
  const b = await seedBooking();
  await env.db.insert(scheduledJob).values({
    organizationId: env.base.orgId,
    jobType: "approval_overdue",
    runAt: new Date(Date.now() + 3_600_000),
    payload: { bookingId: b.id, n: 1 },
    dedupeKey: `approval_overdue:${b.id}:1`,
  });
  const res = await approve(b.id);
  expect(res.status).toBe(200);
  const detail = BookingsApproveResponse.parse(await res.json());
  expect(detail).toMatchObject({ id: b.id, status: "confirmed" });
  const row = await bookingRow(b.id);
  expect(row?.status).toBe("confirmed");
  expect(row?.confirmedAt).toBeInstanceOf(Date);
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.entityId, b.id));
  expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([["awaiting_approval", "confirmed"]]);
  const [overdue] = await env.db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.dedupeKey, `approval_overdue:${b.id}:1`));
  expect(overdue?.status).toBe("cancelled");
  const [appt] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, b.apptId));
  const [reminder] = await env.db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.dedupeKey, `reminder_24h:${b.apptId}:${appt?.startsAt.toISOString()}`));
  expect(reminder).toMatchObject({
    jobType: "reminder_24h",
    status: "pending",
    payload: { bookingId: b.id, entityType: "groom_appointment", entityId: b.apptId },
  });
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `booking_confirmed:${b.id}:${env.base.customerId}`));
  expect(note).toMatchObject({ templateKey: "customer.booking_confirmed", recipientId: env.base.customerId });
  expect(note?.payload).toMatchObject({
    bookingNo: row?.bookingNo,
    summary: `${b.petName}: อาบน้ำ`,
    shopName: "Shop a",
    bookingUrl: `https://petbooking.test/liff/shop-a/bookings/${b.id}`,
  });
});

it("no reminder when the appointment is less than 24 h away", async () => {
  const b = await seedBooking({}, env.base, new Date(Date.now() + 3 * 3_600_000));
  expect((await approve(b.id)).status).toBe(200);
  expect(
    await env.db
      .select()
      .from(scheduledJob)
      .where(eq(scheduledJob.dedupeKey, `reminder_24h:${b.apptId}:${new Date(Date.now()).toISOString()}`)),
  ).toEqual([]);
  const jobs = (await env.db.select().from(scheduledJob)).filter((j) => (j.payload as { entityId?: string }).entityId === b.apptId);
  expect(jobs).toEqual([]);
});

it.each(["confirmed", "awaiting_deposit", "cancelled"] as const)("from %s → INVALID_TRANSITION", async (status) => {
  expect(await codeOf(await approve((await seedBooking({ status })).id))).toBe("INVALID_TRANSITION");
});

it("malformed id → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await approve("x"))).toBe("VALIDATION_FAILED");
  const b = await seedBooking();
  expect(await codeOf(await approve(b.id, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await approve((await seedBooking({}, other)).id))).toBe("NOT_FOUND");
  expect((await bookingRow(b.id))?.status).toBe("awaiting_approval");
});
