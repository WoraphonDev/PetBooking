import {
  BookingsWaiveDepositParams,
  BookingsWaiveDepositRequest,
  BookingsWaiveDepositResponse,
} from "@app/contracts/endpoints/bookings.waiveDeposit";
import { auditLog, booking, groomAppointment, groomStation, notification, pet, scheduledJob, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsWaiveDeposit } from "../../../src/services/bookings/waiveDeposit.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff(
  "bookings.waiveDeposit",
  { body: BookingsWaiveDepositRequest, params: BookingsWaiveDepositParams },
  bookingsWaiveDeposit,
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
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];
const jobsOf = async (prefix: string) => (await env.db.select().from(scheduledJob)).filter((j) => j.dedupeKey.startsWith(prefix));
const waive = (id: string, body: unknown = { reason: "ลูกค้าประจำ" }, role?: "owner" | "front_desk" | "staff") =>
  call("/deposit/waive", "POST", id, body, role);

it("awaiting_deposit → confirmed with the deposit waived: required 0, not_required, hold cleared, audit, booking_confirmed", async () => {
  const b = await seedBooking();
  const res = await waive(b.id);
  expect(res.status).toBe(200);
  expect(BookingsWaiveDepositResponse.parse(await res.json())).toMatchObject({
    status: "confirmed",
    depositStatus: "not_required",
    depositRequiredSatang: 0,
    holdExpiresAt: null,
  });
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, b.id));
  expect(audit).toMatchObject({
    action: "deposit.waive",
    reason: "ลูกค้าประจำ",
    before: { depositRequiredSatang: 30_000, depositStatus: "pending" },
    after: { depositRequiredSatang: 0, depositStatus: "not_required" },
  });
  expect((await jobsOf(`expire_hold:${b.id}:`))[0]?.status).toBe("cancelled");
  expect((await env.db.select().from(notification)).map((n) => n.dedupeKey)).toContain(`booking_confirmed:${b.id}:${env.base.customerId}`);
});

it("a confirmed booking with a pending deposit keeps its status", async () => {
  const b = await seedBooking({ status: "confirmed" });
  expect(BookingsWaiveDepositResponse.parse(await (await waive(b.id)).json())).toMatchObject({
    status: "confirmed",
    depositStatus: "not_required",
  });
});

it("a verified deposit → INVALID_TRANSITION", async () => {
  expect(
    await codeOf(await waive((await seedBooking({ status: "confirmed", depositStatus: "verified", depositVerifiedSatang: 30_000 })).id)),
  ).toBe("INVALID_TRANSITION");
});

it("reason < 3 → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const b = await seedBooking();
  expect(await codeOf(await waive(b.id, { reason: "ok" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await waive(b.id, undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await waive((await seedBooking({}, other)).id))).toBe("NOT_FOUND");
  expect((await bookingRow(b.id))?.depositStatus).toBe("pending");
});
