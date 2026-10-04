import {
  BookingsRecordDepositParams,
  BookingsRecordDepositRequest,
  BookingsRecordDepositResponse,
} from "@app/contracts/endpoints/bookings.recordDeposit";
import {
  auditLog,
  booking,
  bookingEvent,
  groomAppointment,
  groomStation,
  notification,
  payment,
  pet,
  scheduledJob,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsRecordDeposit } from "../../../src/services/bookings/recordDeposit.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff(
  "bookings.recordDeposit",
  { body: BookingsRecordDepositRequest, params: BookingsRecordDepositParams },
  bookingsRecordDeposit,
);
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

let seq = 0;
/** a booking with one grooming appointment (own groomer/station) starting `hoursAhead` from the real clock */
async function seedBooking(values: Partial<typeof booking.$inferInsert> = {}, org: SeedOrg = env.base, hoursAhead = 72) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const startsAt = new Date(Date.now() + hoursAhead * 3_600_000);
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
      status: "awaiting_deposit",
      depositStatus: "pending",
      depositRequiredSatang: 30_000,
      holdExpiresAt: new Date(Date.now() + 3_600_000),
      policySnapshot: { groomingFreeCancelHours: 24, lateCancelForfeitPercent: 50, cancelRefundMode: "credit" },
      firstServiceAt: startsAt,
      ...values,
    })
    .returning();
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T${seq}` })
    .returning();
  const [g] = await env.db
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
      groomerId: g?.id ?? "",
      stationId: st?.id ?? "",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
    })
    .returning();
  await env.db.insert(scheduledJob).values({
    organizationId: org.orgId,
    jobType: "expire_hold",
    runAt: new Date(Date.now() + 3_600_000),
    payload: { bookingId: bk?.id },
    dedupeKey: `expire_hold:${bk?.id}:x`,
  });
  return { id: bk?.id ?? "", apptId: a?.id ?? "" };
}
async function call(
  path: string,
  method: string,
  bookingId: string,
  body?: unknown,
  role: "owner" | "front_desk" | "staff" = "front_desk",
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/bookings/${bookingId}${path}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: { bookingId } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const jobsOf = async (prefix: string) => (await env.db.select().from(scheduledJob)).filter((j) => j.dedupeKey.startsWith(prefix));
const record = (id: string, body: unknown = { method: "cash", amountSatang: 30_000 }, role?: "owner" | "front_desk" | "staff") =>
  call("/deposit", "POST", id, body, role);

it("awaiting_deposit → confirmed: payment, deposit verified, audit, hold cleared, reminder + booking_confirmed + deposit_confirmed", async () => {
  const b = await seedBooking();
  const res = await record(b.id, { method: "bank_transfer", amountSatang: 30_000, reference: "TX-9" });
  expect(res.status).toBe(200);
  const detail = BookingsRecordDepositResponse.parse(await res.json());
  expect(detail).toMatchObject({ status: "confirmed", depositStatus: "verified", depositVerifiedSatang: 30_000, holdExpiresAt: null });
  const [p] = await env.db.select().from(payment).where(eq(payment.bookingId, b.id));
  expect(p).toMatchObject({
    method: "bank_transfer",
    amountSatang: 30_000,
    reference: "TX-9",
    billId: null,
    receivedBy: env.base.staff.front_desk,
    status: "posted",
  });
  const [audit] = await env.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityId, p?.id ?? ""));
  expect(audit).toMatchObject({ action: "payment.create", after: { method: "bank_transfer", amountSatang: 30_000, bookingId: b.id } });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, b.id));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus]).sort()).toEqual(
    [
      ["booking", "awaiting_deposit", "confirmed"],
      ["deposit", "pending", "verified"],
    ].sort(),
  );
  expect((await jobsOf(`expire_hold:${b.id}:`))[0]?.status).toBe("cancelled");
  expect((await jobsOf(`reminder_24h:${b.apptId}:`)).map((j) => j.status)).toEqual(["pending"]);
  const keys = (await env.db.select().from(notification)).map((n) => n.dedupeKey);
  expect(keys).toEqual(
    expect.arrayContaining([`booking_confirmed:${b.id}:${env.base.customerId}`, `deposit_confirmed:${b.id}:${env.base.customerId}`]),
  );
  const [dep] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `deposit_confirmed:${b.id}:${env.base.customerId}`));
  expect(dep?.payload).toEqual({ bookingNo: detail.bookingNo, amount: "฿300" });
});

it("a booking that needed approval goes to awaiting_approval (no booking_confirmed yet)", async () => {
  const b = await seedBooking({ approvalDueAt: new Date(Date.now() + 7_200_000) });
  const detail = BookingsRecordDepositResponse.parse(await (await record(b.id)).json());
  expect(detail.status).toBe("awaiting_approval");
  expect((await env.db.select().from(notification)).filter((n) => n.dedupeKey.startsWith(`booking_confirmed:${b.id}:`))).toEqual([]);
});

it("an already confirmed booking with a pending deposit only records the deposit", async () => {
  const b = await seedBooking({ status: "confirmed" });
  const detail = BookingsRecordDepositResponse.parse(await (await record(b.id, { method: "cash", amountSatang: 10_000 })).json());
  expect(detail).toMatchObject({ status: "confirmed", depositStatus: "verified", depositVerifiedSatang: 10_000 });
});

it("a verified deposit or a cancelled booking → INVALID_TRANSITION", async () => {
  expect(
    await codeOf(await record((await seedBooking({ status: "confirmed", depositStatus: "verified", depositVerifiedSatang: 30_000 })).id)),
  ).toBe("INVALID_TRANSITION");
  expect(await codeOf(await record((await seedBooking({ status: "cancelled" })).id))).toBe("INVALID_TRANSITION");
});

it.each([
  ["amount 0", { method: "cash", amountSatang: 0 }],
  ["credit is not a deposit method", { method: "credit", amountSatang: 100 }],
  ["missing method", { amountSatang: 100 }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await record((await seedBooking()).id, body))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  expect(await codeOf(await record((await seedBooking()).id, undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await record((await seedBooking({}, other)).id))).toBe("NOT_FOUND");
});
