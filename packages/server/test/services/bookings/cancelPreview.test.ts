import {
  BookingsCancelPreviewParams,
  BookingsCancelPreviewQuery,
  BookingsCancelPreviewResponse,
} from "@app/contracts/endpoints/bookings.cancelPreview";
import { booking, groomAppointment, groomStation, pet, scheduledJob, staffUser } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsCancelPreview } from "../../../src/services/bookings/cancelPreview.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff(
  "bookings.cancelPreview",
  { query: BookingsCancelPreviewQuery, params: BookingsCancelPreviewParams },
  bookingsCancelPreview,
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
const preview = (id: string, kind: string, role?: "owner" | "front_desk" | "staff") =>
  call(`/cancel-preview?kind=${kind}`, "GET", id, undefined, role);

it("customer cancel well ahead: not late, full return as credit (snapshot policy)", async () => {
  const b = await seedBooking({ status: "confirmed", depositStatus: "verified", depositVerifiedSatang: 30_000 });
  const res = await preview(b.id, "customer_cancel");
  expect(res.status).toBe(200);
  expect(BookingsCancelPreviewResponse.parse(await res.json())).toMatchObject({
    isLate: false,
    freeCancelHours: 24,
    forfeitSatang: 0,
    returnSatang: 30_000,
    returnMode: "credit",
  });
});

it("customer cancel inside the free window forfeits per the snapshot percent; shop cancel returns everything", async () => {
  const b = await seedBooking({ status: "confirmed", depositStatus: "verified", depositVerifiedSatang: 30_000 }, env.base, 5);
  expect(BookingsCancelPreviewResponse.parse(await (await preview(b.id, "customer_cancel")).json())).toMatchObject({
    isLate: true,
    forfeitSatang: 15_000,
    returnSatang: 15_000,
  });
  expect(BookingsCancelPreviewResponse.parse(await (await preview(b.id, "shop_cancel")).json())).toMatchObject({
    isLate: false,
    forfeitSatang: 0,
    returnSatang: 30_000,
    returnMode: "refund",
  });
});

it("kind missing or unknown → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const b = await seedBooking();
  expect(await codeOf(await call("/cancel-preview", "GET", b.id))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await preview(b.id, "no_show"))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await preview(b.id, "shop_cancel", "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await preview((await seedBooking({}, other)).id, "shop_cancel"))).toBe("NOT_FOUND");
});
