// T-0174 liff.bookings: the customer's bookings in this branch — upcoming (open) or past (closed), with R-21 buttons.
import { LiffBookingsParams, LiffBookingsQuery, LiffBookingsResponse } from "@app/contracts/endpoints/liff.bookings";
import { booking, customer, groomAppointment, groomAppointmentItem, groomStation, pet, service } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffBookings } from "../../../src/services/liff/bookings.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withCustomer("liff.bookings", { params: LiffBookingsParams, query: LiffBookingsQuery }, liffBookings);
const call = async (slug: string, s: SeedOrg, query = "") => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/bookings${query}`, {
      headers: { origin: "https://petbooking.test", cookie: `cid=${encodeURIComponent(token)}` },
    }),
    { params: { branchSlug: slug } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

async function addBooking(
  s: SeedOrg,
  no: string,
  extra: Partial<typeof booking.$inferInsert> & { firstServiceAt: Date },
  customerId = s.customerId,
) {
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId,
      bookingNo: no,
      channel: "line_liff",
      createdByType: "customer",
      status: "confirmed",
      policySnapshot: {},
      ...extra,
    })
    .returning();
  if (!bk) throw new Error("booking fixture");
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: `น้อง ${no}`, species: "dog" })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `โต๊ะ ${no}` })
    .returning();
  const [svc] = await env.db
    .insert(service)
    .values({ ...tenant, nameTh: "อาบน้ำตัดขน", category: "bath" })
    .returning();
  const [appt] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk.id,
      petId: p?.id ?? "",
      groomerId: s.staff.staff,
      groomerPreference: "any",
      stationId: station?.id ?? "",
      startsAt: extra.firstServiceAt,
      endsAt: new Date(extra.firstServiceAt.getTime() + 3_600_000),
      blockedUntil: new Date(extra.firstServiceAt.getTime() + 3_600_000),
      servicesTotalSatang: 50_000,
    })
    .returning();
  await env.db.insert(groomAppointmentItem).values({
    organizationId: s.orgId,
    appointmentId: appt?.id ?? "",
    serviceId: svc?.id ?? "",
    nameSnapshot: "อาบน้ำตัดขน",
    priceSatang: 50_000,
    durationMinutes: 60,
  });
  return bk;
}

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

it("upcoming (default): open bookings soonest first with pets, summary and R-21 buttons; past: closed ones latest first", async () => {
  const s = await seedOrg(env.db, "lb1");
  const later = await addBooking(s, "B-LB1-2", { firstServiceAt: inHours(72), estimatedTotalSatang: 50_000 });
  const soon = await addBooking(s, "B-LB1-1", {
    firstServiceAt: inHours(3),
    status: "awaiting_deposit",
    depositStatus: "pending",
    policySnapshot: { rescheduleCutoffHours: 24 },
  });
  const oldDone = await addBooking(s, "B-LB1-3", { firstServiceAt: inHours(-200), status: "closed" });
  const cancelled = await addBooking(s, "B-LB1-4", { firstServiceAt: inHours(-20), status: "cancelled" });

  const res = await call("shop-lb1", s);
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffBookingsResponse;
  expect(LiffBookingsResponse.safeParse(body).success).toBe(true);
  expect(body.map((b) => b.id)).toEqual([soon.id, later.id]);
  expect(body[0]).toMatchObject({
    bookingNo: "B-LB1-1",
    status: "awaiting_deposit",
    petNames: ["น้อง B-LB1-1"],
    summary: "อาบน้ำตัดขน",
    depositStatus: "pending",
    canCancel: true,
    canReschedule: false,
  });
  expect(body[1]).toMatchObject({ estimatedTotalSatang: 50_000, canCancel: true, canReschedule: true });

  const past = (await (await call("shop-lb1", s, "?scope=past")).json()) as LiffBookingsResponse;
  expect(past.map((b) => b.id)).toEqual([cancelled.id, oldDone.id]);
  expect(past[0]).toMatchObject({ canCancel: false, canReschedule: false });
});

it("only the signed-in customer's bookings; a bad scope → VALIDATION_FAILED; another shop → UNAUTHENTICATED", async () => {
  const s = await seedOrg(env.db, "lb2");
  const t = await seedOrg(env.db, "lb3");
  const [someone] = await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: t.ownerProfileId }).returning();
  await addBooking(s, "B-LB2-1", { firstServiceAt: inHours(48) }, someone?.id);
  expect(await (await call("shop-lb2", s)).json()).toEqual([]);
  expect(await errorCode(await call("shop-lb2", s, "?scope=all"))).toBe("VALIDATION_FAILED");
  expect(await errorCode(await call("shop-lb3", s))).toBe("UNAUTHENTICATED");
});
