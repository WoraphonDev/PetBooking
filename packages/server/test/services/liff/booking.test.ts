// T-0174 liff.booking: MyBookingDetail of the customer's own booking — children, payment, R-07 preview, R-21, shop links.
import { LiffBookingParams, LiffBookingResponse } from "@app/contracts/endpoints/liff.booking";
import {
  booking,
  branch,
  customer,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  pet,
  roomType,
  roomUnit,
  service,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffBooking } from "../../../src/services/liff/booking.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withCustomer("liff.booking", { params: LiffBookingParams }, liffBooking);
const call = async (slug: string, s: SeedOrg, bookingId: string) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/bookings/${bookingId}`, {
      headers: { origin: "https://petbooking.test", cookie: `cid=${encodeURIComponent(token)}` },
    }),
    { params: { branchSlug: slug, bookingId } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

async function addBooking(s: SeedOrg, extra: Partial<typeof booking.$inferInsert> = {}, customerId = s.customerId) {
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: s.orgId,
      branchId: s.branchId,
      customerId,
      bookingNo: `B-${crypto.randomUUID().slice(0, 8)}`,
      channel: "line_liff",
      createdByType: "customer",
      status: "confirmed",
      policySnapshot: {},
      firstServiceAt: inHours(48),
      ...extra,
    })
    .returning();
  if (!bk) throw new Error("booking fixture");
  return bk;
}

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

it("returns grooming / stay / daycare lines, the deposit PaymentInstruction, R-07 preview, R-21 and shop links", async () => {
  const s = await seedOrg(env.db, "bd1");
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  await env.db
    .update(branch)
    .set({
      phone: "021234567",
      latitude: 13.75,
      longitude: 100.5,
      promptpayType: "phone",
      promptpayId: "0812345678",
      promptpayAccountName: "ร้าน",
    })
    .where(eq(branch.id, s.branchId));
  const start = inHours(10);
  const bk = await addBooking(s, {
    status: "confirmed",
    firstServiceAt: start,
    estimatedTotalSatang: 200_000,
    depositRequiredSatang: 30_000,
    depositVerifiedSatang: 10_000,
    depositStatus: "pending",
    policySnapshot: {
      groomingFreeCancelHours: 24,
      hotelFreeCancelHours: 72,
      lateCancelForfeitPercent: 50,
      rescheduleCutoffHours: 24,
      cancelRefundMode: "credit",
    },
  });
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "โมจิ", species: "dog" })
    .returning();
  const petId = mochi?.id ?? "";
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "โต๊ะ 1" })
    .returning();
  const [svc] = await env.db
    .insert(service)
    .values({ ...tenant, nameTh: "อาบน้ำ", category: "bath" })
    .returning();
  const [appt] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk.id,
      petId,
      groomerId: s.staff.staff,
      groomerPreference: "any",
      stationId: station?.id ?? "",
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
      blockedUntil: new Date(start.getTime() + 3_600_000),
      servicesTotalSatang: 50_000,
    })
    .returning();
  await env.db.insert(groomAppointmentItem).values({
    organizationId: s.orgId,
    appointmentId: appt?.id ?? "",
    serviceId: svc?.id ?? "",
    nameSnapshot: "อาบน้ำ",
    priceSatang: 50_000,
    durationMinutes: 60,
  });
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: "A1" })
    .returning();
  await env.db.insert(stay).values({
    ...tenant,
    bookingId: bk.id,
    petId,
    roomTypeId: type?.id ?? "",
    roomUnitId: unit?.id ?? "",
    checkInDate: "2026-12-01",
    checkOutDate: "2026-12-03",
    nights: 2,
    nightlyPriceSatang: 60_000,
    roomTotalSatang: 120_000,
  });
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db
    .insert(daycareVisit)
    .values({ ...tenant, bookingId: bk.id, petId, sessionTypeId: session?.id ?? "", visitDate: "2026-12-05", priceSatang: 30_000 });

  const res = await call("shop-bd1", s, bk.id);
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffBookingResponse;
  expect(LiffBookingResponse.safeParse(body).success).toBe(true);
  expect(body.booking).toMatchObject({
    id: bk.id,
    petNames: ["โมจิ"],
    summary: "อาบน้ำ, ห้องเล็ก, เต็มวัน",
    canCancel: true,
    canReschedule: false,
  });
  expect(body.groom).toEqual([{ startsAt: start.toISOString(), petName: "โมจิ", groomerName: "staff", services: ["อาบน้ำ"] }]);
  expect(body.stays).toEqual([{ checkInDate: "2026-12-01", checkOutDate: "2026-12-03", roomTypeName: "ห้องเล็ก" }]);
  expect(body.daycare).toEqual([{ visitDate: "2026-12-05", sessionName: "เต็มวัน" }]);
  expect(body.payment).toMatchObject({ amountSatang: 20_000, accountName: "ร้าน", promptpayIdMasked: "678" });
  expect(body.policySnapshot).toMatchObject({ lateCancelForfeitPercent: 50 });
  // 10 h before, hotel 72 h dominates → late, 50% of the verified 10,000 satang
  expect(body.cancelPreview).toMatchObject({
    isLate: true,
    freeCancelHours: 72,
    forfeitSatang: 5_000,
    returnSatang: 5_000,
    returnMode: "credit",
  });
  expect(body.rescheduleBlockedReason).toBe("TOO_LATE_TO_RESCHEDULE");
  expect(body).toMatchObject({
    shopPhone: "021234567",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=13.75,100.5",
    icsUrl: `/api/v1/liff/shop-bd1/bookings/${bk.id}/calendar.ics`,
  });
});

it("a cancelled booking: no preview, no payment, no map without coordinates", async () => {
  const s = await seedOrg(env.db, "bd2");
  const bk = await addBooking(s, { status: "cancelled" });
  const body = (await (await call("shop-bd2", s, bk.id)).json()) as LiffBookingResponse;
  expect(body).toMatchObject({
    booking: { canCancel: false, canReschedule: false, petNames: [], summary: "" },
    payment: null,
    cancelPreview: null,
    rescheduleBlockedReason: "STATUS_NOT_ALLOWED",
    mapUrl: null,
  });
});

it("another customer's or another shop's booking → NOT_FOUND; a bad id → VALIDATION_FAILED", async () => {
  const s = await seedOrg(env.db, "bd3");
  const t = await seedOrg(env.db, "bd4");
  const [someone] = await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: t.ownerProfileId }).returning();
  const notMine = await addBooking(s, {}, someone?.id);
  const otherShop = await addBooking(t);
  for (const id of [notMine.id, otherShop.id, crypto.randomUUID()])
    expect(await errorCode(await call("shop-bd3", s, id))).toBe("NOT_FOUND");
  expect(await errorCode(await call("shop-bd3", s, "nope"))).toBe("VALIDATION_FAILED");
});
