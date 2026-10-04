import { BookingsGetParams, BookingsGetResponse } from "@app/contracts/endpoints/bookings.get";
import {
  appointmentSurcharge,
  booking,
  bookingEvent,
  branch,
  branchPolicy,
  consentDocument,
  daycareSessionType,
  daycareVisit,
  fileObject,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  ownerProfile,
  paymentSlip,
  pet,
  roomType,
  roomUnit,
  service,
  stay,
  stayIntake,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { bookingsGet } from "../../../src/services/bookings/get.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("bookings.get", { params: BookingsGetParams }, bookingsGet);
let env: TestEnv;
let other: SeedOrg;
const ids = { booking: "", appt: "", stay: "", visit: "", slip: "", mochi: "", unit: "", bath: "", file: "" };

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  setStorage(createFakeStorage());
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const o = env.base.orgId;
  await env.db
    .update(ownerProfile)
    .set({ firstName: "มะลิ", phoneE164: "+66812345678" })
    .where(eq(ownerProfile.id, env.base.ownerProfileId));
  await env.db
    .update(branch)
    .set({ promptpayType: "phone", promptpayId: "0812345678", promptpayAccountName: "ร้าน A" })
    .where(eq(branch.id, env.base.branchId));
  await env.db.insert(branchPolicy).values({ branchId: env.base.branchId, requiredVaccinesDog: ["rabies"] });
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: env.base.ownerProfileId, createdInOrgId: o, name: "โมจิ", species: "dog" })
    .returning();
  ids.mochi = mochi?.id ?? "";
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: env.base.customerId,
      bookingNo: "B6910-0007",
      channel: "phone",
      createdByType: "staff",
      createdById: env.base.staff.front_desk,
      status: "confirmed",
      estimatedTotalSatang: 250_000,
      depositRequiredSatang: 50_000,
      depositStatus: "pending",
      policySnapshot: { bufferMinutes: 10 },
      customerNote: "กลัวไดร์",
      confirmedAt: new Date("2026-10-04T01:00:00.000Z"),
      firstServiceAt: new Date("2026-10-07T03:00:00.000Z"),
    })
    .returning();
  ids.booking = bk?.id ?? "";
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "โต๊ะ 1" })
    .returning();
  const [bath] = await env.db
    .insert(service)
    .values({ ...tenant, nameTh: "อาบน้ำ", category: "bath" })
    .returning();
  ids.bath = bath?.id ?? "";
  const [appt] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: ids.booking,
      petId: ids.mochi,
      groomerId: env.base.staff.staff,
      groomerPreference: "specific",
      stationId: station?.id ?? "",
      startsAt: new Date("2026-10-07T03:00:00.000Z"),
      endsAt: new Date("2026-10-07T04:00:00.000Z"),
      blockedUntil: new Date("2026-10-07T04:10:00.000Z"),
      servicesTotalSatang: 50_000,
      surchargeTotalSatang: 10_000,
    })
    .returning();
  ids.appt = appt?.id ?? "";
  await env.db.insert(groomAppointmentItem).values({
    organizationId: o,
    appointmentId: ids.appt,
    serviceId: ids.bath,
    nameSnapshot: "อาบน้ำ",
    priceSatang: 50_000,
    durationMinutes: 60,
  });
  await env.db.insert(appointmentSurcharge).values({
    organizationId: o,
    appointmentId: ids.appt,
    name: "ขนพันกัน",
    amountSatang: 10_000,
    reason: "สังกะตัง",
    createdBy: env.base.staff.staff,
  });
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องเล็ก" })
    .returning();
  const [unit] = await env.db
    .insert(roomUnit)
    .values({ ...tenant, roomTypeId: type?.id ?? "", code: "A1" })
    .returning();
  ids.unit = unit?.id ?? "";
  const [st] = await env.db
    .insert(stay)
    .values({
      ...tenant,
      bookingId: ids.booking,
      petId: ids.mochi,
      roomTypeId: type?.id ?? "",
      roomUnitId: ids.unit,
      checkInDate: "2026-10-08",
      checkOutDate: "2026-10-10",
      expectedCheckInTime: "10:00",
      nights: 2,
      nightlyPriceSatang: 60_000,
      roomTotalSatang: 120_000,
    })
    .returning();
  ids.stay = st?.id ?? "";
  await env.db.insert(stayIntake).values({ organizationId: o, stayId: ids.stay, completedAt: new Date("2026-10-04T02:00:00.000Z") });
  const [sig] = await env.db
    .insert(fileObject)
    .values({
      organizationId: o,
      kind: "signature",
      storageKey: "org/x/signature/a.png",
      mimeType: "image/png",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  await env.db.insert(consentDocument).values({
    organizationId: o,
    kind: "boarding_agreement",
    stayId: ids.stay,
    customerId: env.base.customerId,
    bodySnapshot: "ข้อตกลง",
    signerName: "มะลิ",
    signatureFileId: sig?.id ?? "",
  });
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
    .returning();
  const [visit] = await env.db
    .insert(daycareVisit)
    .values({
      ...tenant,
      bookingId: ids.booking,
      petId: ids.mochi,
      sessionTypeId: session?.id ?? "",
      visitDate: "2026-10-11",
      priceSatang: 30_000,
    })
    .returning();
  ids.visit = visit?.id ?? "";
  const [slipFile] = await env.db
    .insert(fileObject)
    .values({
      organizationId: o,
      kind: "slip",
      storageKey: "org/x/slip/s.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "customer",
    })
    .returning();
  ids.file = slipFile?.id ?? "";
  const [slip] = await env.db
    .insert(paymentSlip)
    .values({
      ...tenant,
      bookingId: ids.booking,
      fileId: ids.file,
      uploadedByType: "customer",
      amountExpectedSatang: 50_000,
      transRef: "TX1",
      status: "rejected",
      rejectReason: "ยอดไม่ตรง",
    })
    .returning();
  ids.slip = slip?.id ?? "";
  await env.db.insert(bookingEvent).values([
    {
      organizationId: o,
      bookingId: ids.booking,
      entityType: "booking",
      entityId: ids.booking,
      toStatus: "confirmed",
      actorType: "staff",
      createdAt: new Date("2026-10-04T01:00:00.000Z"),
    },
    {
      organizationId: o,
      bookingId: ids.booking,
      entityType: "groom_appointment",
      entityId: ids.appt,
      toStatus: "scheduled",
      actorType: "staff",
      createdAt: new Date("2026-10-04T01:00:00.000Z"),
    },
  ]);
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});

async function get(bookingId: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  resetRateLimits();
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/bookings/${bookingId}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: { bookingId },
  });
}

it.each(["owner", "front_desk", "staff"] as const)("%s reads the full BookingDetail", async (role) => {
  const res = await get(ids.booking, role);
  expect(res.status).toBe(200);
  const d = BookingsGetResponse.parse(await res.json());
  expect(d).toMatchObject({
    id: ids.booking,
    bookingNo: "B6910-0007",
    status: "confirmed",
    channel: "phone",
    customer: { id: env.base.customerId, firstName: "มะลิ" },
    createdByType: "staff",
    estimatedTotalSatang: 250_000,
    depositRequiredSatang: 50_000,
    depositStatus: "pending",
    depositVerifiedSatang: 0,
    policySnapshot: { bufferMinutes: 10 },
    customerNote: "กลัวไดร์",
    confirmedAt: "2026-10-04T01:00:00.000Z",
    firstServiceAt: "2026-10-07T03:00:00.000Z",
    billId: null,
  });
  expect(d.groom).toEqual([
    expect.objectContaining({
      id: ids.appt,
      bookingNo: "B6910-0007",
      status: "scheduled",
      groomerName: "staff",
      groomerPreference: "specific",
      stationName: "โต๊ะ 1",
      pet: expect.objectContaining({ id: ids.mochi, name: "โมจิ" }),
      customerName: "มะลิ",
      customerPhone: "+66812345678",
      items: [{ serviceId: ids.bath, name: "อาบน้ำ", isAddon: false, priceSatang: 50_000, durationMinutes: 60, customerPackageId: null }],
      surcharges: [expect.objectContaining({ name: "ขนพันกัน", amountSatang: 10_000, reason: "สังกะตัง" })],
      servicesTotalSatang: 50_000,
      surchargeTotalSatang: 10_000,
      depositStatus: "pending",
    }),
  ]);
  expect(d.stays).toEqual([
    expect.objectContaining({
      id: ids.stay,
      roomTypeName: "ห้องเล็ก",
      roomUnitId: ids.unit,
      roomCode: "A1",
      checkInDate: "2026-10-08",
      checkOutDate: "2026-10-10",
      expectedCheckInTime: "10:00",
      expectedCheckOutTime: null,
      nights: 2,
      roomTotalSatang: 120_000,
      intakeCompleted: true,
      agreementSigned: true,
      vaccineGate: { ok: false, missing: ["rabies"], expired: [], pendingReview: [] },
    }),
  ]);
  expect(d.daycare).toEqual([
    expect.objectContaining({ id: ids.visit, sessionName: "เต็มวัน", visitDate: "2026-10-11", priceSatang: 30_000, status: "reserved" }),
  ]);
  expect(d.slips).toEqual([
    expect.objectContaining({
      id: ids.slip,
      bookingNo: "B6910-0007",
      customerName: "มะลิ",
      imageUrl: "https://storage.test/org/x/slip/s.jpg?op=get&expires=3600",
      amountExpectedSatang: 50_000,
      transRef: "TX1",
      isDuplicate: false,
      status: "rejected",
      rejectReason: "ยอดไม่ตรง",
    }),
  ]);
  expect(d.payment).toMatchObject({ amountSatang: 50_000, accountName: "ร้าน A", promptpayIdMasked: "678" });
  expect(d.events.map((e) => [e.entityType, e.toStatus])).toEqual([
    ["booking", "confirmed"],
    ["groom_appointment", "scheduled"],
  ]);
});

it("malformed id → VALIDATION_FAILED", async () => {
  const res = await get("not-a-uuid");
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
});

it("another org's booking or an unknown id → NOT_FOUND", async () => {
  const [foreign] = await env.db
    .insert(booking)
    .values({
      organizationId: other.orgId,
      branchId: other.branchId,
      customerId: other.customerId,
      bookingNo: "B6910-0001",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  for (const id of [foreign?.id ?? "", "00000000-0000-4000-8000-000000000000"]) {
    const res = await get(id);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  }
});
