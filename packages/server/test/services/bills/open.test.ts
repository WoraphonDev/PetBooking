import { BillsOpenRequest, BillsOpenResponse } from "@app/contracts/endpoints/bills.open";
import {
  appointmentSurcharge,
  bill,
  billLine,
  booking,
  customerPackage,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  packageRedemption,
  packageTemplate,
  payment,
  pet,
  roomType,
  roomUnit,
  service,
  stay,
  stayAddon,
} from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { billsOpen } from "../../../src/services/bills/open.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("bills.open", { body: BillsOpenRequest }, billsOpen);
let env: TestEnv;
let foreign: SeedOrg;
type Seed = Awaited<ReturnType<typeof seed>>;
let s: Seed;

/** confirmed booking: Mochi bath 450 + nail add-on 100 + matted surcharge 150 + a package bath; a cancelled appointment; deposit 200 verified */
async function seed(org: SeedOrg, bookingNo = "B-1", day = "05") {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T-${bookingNo}` })
    .returning();
  const [bath, nail] = await env.db
    .insert(service)
    .values([
      { ...tenant, category: "bath", nameTh: "อาบน้ำ" },
      { ...tenant, category: "nail", nameTh: "ตัดเล็บ", isAddon: true },
    ])
    .returning();
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" })
    .returning();
  const [b] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      depositRequiredSatang: 20_000,
      depositStatus: "verified",
      depositVerifiedSatang: 20_000,
    })
    .returning();
  const appt = (status: "done" | "cancelled", hour: string) => ({
    ...tenant,
    bookingId: b?.id ?? "",
    petId: mochi?.id ?? "",
    groomerId: org.staff.staff,
    stationId: st?.id ?? "",
    startsAt: new Date(`2026-10-${day}T${hour}:00:00.000Z`),
    endsAt: new Date(`2026-10-${day}T${hour}:30:00.000Z`),
    blockedUntil: new Date(`2026-10-${day}T${hour}:30:00.000Z`),
    status,
  });
  const [done, cancelled] = await env.db
    .insert(groomAppointment)
    .values([appt("done", "03"), appt("cancelled", "05")])
    .returning();
  const [tpl] = await env.db
    .insert(packageTemplate)
    .values({ ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: bath?.id ?? "", sessionsCount: 5, priceSatang: 200_000 })
    .returning();
  const [paidBill] = await env.db
    .insert(bill)
    .values({ ...tenant, openedBy: org.staff.owner, status: "paid" })
    .returning();
  const [pkg] = await env.db
    .insert(customerPackage)
    .values({
      organizationId: org.orgId,
      customerId: org.customerId,
      templateId: tpl?.id ?? "",
      petId: mochi?.id ?? null,
      sessionsTotal: 5,
      sessionsUsed: 4,
      unitValueSatang: 40_000,
      purchasedBillId: paidBill?.id ?? "",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    })
    .returning();
  const item = (appointmentId: string, extra: Partial<typeof groomAppointmentItem.$inferInsert>) => ({
    organizationId: org.orgId,
    appointmentId,
    serviceId: bath?.id ?? "",
    nameSnapshot: "อาบน้ำ",
    priceSatang: 45_000,
    durationMinutes: 60,
    ...extra,
  });
  // one insert per item: created_at keeps the booked order
  for (const values of [
    item(done?.id ?? "", {}),
    item(done?.id ?? "", { serviceId: nail?.id ?? "", isAddon: true, nameSnapshot: "ตัดเล็บ", priceSatang: 10_000, durationMinutes: 15 }),
    item(done?.id ?? "", { customerPackageId: pkg?.id ?? "", nameSnapshot: "อาบน้ำ (แพ็กเกจ)" }),
    item(cancelled?.id ?? "", { nameSnapshot: "ยกเลิกแล้ว" }),
  ])
    await env.db.insert(groomAppointmentItem).values(values);
  await env.db.insert(appointmentSurcharge).values({
    organizationId: org.orgId,
    appointmentId: done?.id ?? "",
    name: "ขนพันกัน",
    amountSatang: 15_000,
    reason: "พันทั้งตัว",
    createdBy: org.staff.front_desk,
  });
  return { bookingId: b?.id ?? "", petId: mochi?.id ?? "", packageId: pkg?.id ?? "", tenant };
}

beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  foreign = await otherOrg(env.db);
  s = await seed(env.base);
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

async function post(body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/bills", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

// main services before add-ons, then surcharges, per appointment
it("opens a bill with groom lines, a package redemption and the verified deposit (BillDetail)", async () => {
  const response = await post({ bookingIds: [s.bookingId] });
  expect(response.status).toBe(200);
  const detail = BillsOpenResponse.parse(await response.json());
  expect(detail).toMatchObject({
    status: "open",
    receiptNo: null,
    customer: { id: env.base.customerId, firstName: "Owner a" },
    bookingIds: [s.bookingId],
    subtotalSatang: 70_000,
    billDiscountSatang: 0,
    totalSatang: 70_000,
    paidSatang: 20_000,
    dueSatang: 50_000,
    openedByName: "front_desk",
    depositAvailableSatang: 0,
    customerCreditSatang: 0,
  });
  expect(detail.lines.map((l) => [l.lineType, l.description, l.unitPriceSatang, l.lineTotalSatang, l.petName, l.performerId])).toEqual([
    ["groom_service", "อาบน้ำ", 45_000, 45_000, "Mochi", env.base.staff.staff],
    ["package_redemption", "อาบน้ำ (แพ็กเกจ)", 0, 0, "Mochi", env.base.staff.staff],
    ["groom_addon", "ตัดเล็บ", 10_000, 10_000, "Mochi", env.base.staff.staff],
    ["surcharge", "ขนพันกัน", 15_000, 15_000, "Mochi", env.base.staff.staff],
  ]);
  expect(detail.payments).toEqual([expect.objectContaining({ method: "deposit", amountSatang: 20_000, status: "posted" })]);
  // the package was used up by this redemption → no longer "available"
  expect(detail.availablePackages).toEqual([]);
});

it("writes bill, lines, package_redemption, deposit payment and booking.bill_id in the DB", async () => {
  const detail = await billsOpen(staffCtx(env.base, "owner"), { bookingIds: [s.bookingId] });
  const [row] = await env.db.select().from(bill).where(eq(bill.id, detail.id));
  expect(row).toMatchObject({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    customerId: env.base.customerId,
    status: "open",
    subtotalSatang: 70_000,
    totalSatang: 70_000,
    paidSatang: 20_000,
    openedBy: env.base.staff.owner,
    openedAt: TEST_NOW,
  });
  const lines = await env.db.select().from(billLine).where(eq(billLine.billId, detail.id)).orderBy(asc(billLine.sortOrder));
  expect(lines.map((l) => [l.refType, l.sortOrder])).toEqual([
    ["groom_appointment_item", 0],
    ["groom_appointment_item", 1],
    ["groom_appointment_item", 2],
    ["appointment_surcharge", 3],
  ]);
  expect(await env.db.select().from(packageRedemption)).toEqual([
    expect.objectContaining({
      customerPackageId: s.packageId,
      billLineId: lines[1]?.id,
      petId: s.petId,
      performerId: env.base.staff.staff,
      redeemedAt: TEST_NOW,
    }),
  ]);
  expect((await env.db.select().from(customerPackage).where(eq(customerPackage.id, s.packageId)))[0]).toMatchObject({
    sessionsUsed: 5,
    status: "exhausted",
  });
  expect(await env.db.select().from(payment)).toEqual([
    expect.objectContaining({
      bookingId: s.bookingId,
      billId: detail.id,
      method: "deposit",
      amountSatang: 20_000,
      receivedBy: env.base.staff.owner,
      status: "posted",
    }),
  ]);
  expect((await env.db.select().from(booking).where(eq(booking.id, s.bookingId)))[0]?.billId).toBe(detail.id);
});

it("is idempotent: the same booking returns the existing open bill", async () => {
  const first = await billsOpen(staffCtx(env.base, "owner"), { bookingIds: [s.bookingId] });
  const again = await post({ bookingIds: [s.bookingId] });
  expect(again.status).toBe(200);
  expect(BillsOpenResponse.parse(await again.json()).id).toBe(first.id);
  expect(await env.db.select().from(bill).where(eq(bill.status, "open"))).toHaveLength(1);
  expect(await env.db.select().from(payment)).toHaveLength(1);
});

it("bills a package item at its price when the package can no longer be redeemed", async () => {
  await env.db.update(customerPackage).set({ expiresAt: new Date("2026-01-01T00:00:00.000Z") });
  const detail = await billsOpen(staffCtx(env.base, "owner"), { bookingIds: [s.bookingId] });
  expect(detail.lines.map((l) => l.lineType)).toEqual(["groom_service", "groom_service", "groom_addon", "surcharge"]);
  expect(detail.totalSatang).toBe(115_000);
  expect(await env.db.select().from(packageRedemption)).toEqual([]);
});

it("caps the deposit payment at the bill total", async () => {
  await env.db.update(booking).set({ depositVerifiedSatang: 200_000 }).where(eq(booking.id, s.bookingId));
  const detail = await billsOpen(staffCtx(env.base, "owner"), { bookingIds: [s.bookingId] });
  expect(detail.payments.map((p) => p.amountSatang)).toEqual([70_000]);
  expect(detail.dueSatang).toBe(0);
});

it("opens an empty bill for a customer only, or a walk-in bill without customer", async () => {
  const forCustomer = await billsOpen(staffCtx(env.base, "owner"), { customerId: env.base.customerId });
  expect(forCustomer).toMatchObject({ customer: { id: env.base.customerId }, bookingIds: [], lines: [], totalSatang: 0, payments: [] });
  const walkIn = await billsOpen(staffCtx(env.base, "owner"), {});
  expect(walkIn).toMatchObject({ customer: null, lines: [], customerCreditSatang: 0, availablePackages: [] });
});

it("rejects malformed bodies, mixed customers, a wrong customerId and unconfirmed bookings with VALIDATION_FAILED", async () => {
  for (const body of [{ bookingIds: [] }, { bookingIds: ["x"] }, { bookingIds: [s.bookingId, s.bookingId] }, { customerId: 5 }]) {
    const response = await post(body);
    expect(response.status).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
  const [otherCustomer] = await env.db
    .insert(booking)
    .values({
      ...s.tenant,
      customerId: env.base.customerId,
      bookingNo: "B-2",
      channel: "walk_in",
      createdByType: "staff",
      status: "awaiting_approval",
      policySnapshot: {},
    })
    .returning();
  expect(await code(await post({ bookingIds: [s.bookingId, otherCustomer?.id] }))).toBe("VALIDATION_FAILED");
  expect(await code(await post({ bookingIds: [s.bookingId], customerId: foreign.customerId }))).toBe("VALIDATION_FAILED");
  expect(await env.db.select().from(bill).where(eq(bill.status, "open"))).toEqual([]);
});

it("refuses a booking already on a paid bill (BILL_NOT_OPEN) or split across bills (VALIDATION_FAILED)", async () => {
  const first = await billsOpen(staffCtx(env.base, "owner"), { bookingIds: [s.bookingId] });
  const second = await seed(env.base, "B-3", "06");
  expect(await code(await post({ bookingIds: [s.bookingId, second.bookingId] }))).toBe("VALIDATION_FAILED");
  await env.db.update(bill).set({ status: "paid", paidSatang: 70_000 }).where(eq(bill.id, first.id));
  const response = await post({ bookingIds: [s.bookingId] });
  expect(response.status).toBe(409);
  expect(await code(response)).toBe("BILL_NOT_OPEN");
});

it("forbids role staff", async () => {
  const response = await post({ bookingIds: [s.bookingId] }, "staff");
  expect(response.status).toBe(403);
  expect(await code(response)).toBe("FORBIDDEN");
});

it("answers NOT_FOUND for another organization's booking or customer", async () => {
  const theirs = await seed(foreign, "F-1");
  for (const body of [{ bookingIds: [theirs.bookingId] }, { customerId: foreign.customerId }]) {
    const response = await post(body);
    expect(response.status).toBe(404);
    expect(await code(response)).toBe("NOT_FOUND");
  }
  expect(await env.db.select().from(bill).where(eq(bill.status, "open"))).toEqual([]);
});

/** confirmed hotel+daycare booking: 2 nights × 800 + walk add-on 2 × 100, a daycare day 300; cancelled stay / no-show visit ignored */
async function seedHotel(org: SeedOrg) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [b] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      channel: "walk_in",
      bookingNo: "B-H",
      createdByType: "staff",
      policySnapshot: {},
      status: "confirmed",
      depositStatus: "not_required",
    })
    .returning();
  const [lucky] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Lucky", species: "dog" })
    .returning();
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "ห้องมาตรฐาน" })
    .returning();
  const units = await env.db
    .insert(roomUnit)
    .values(["H1", "H2"].map((code) => ({ ...tenant, roomTypeId: type?.id ?? "", code })))
    .returning();
  const base = { ...tenant, bookingId: b?.id ?? "", petId: lucky?.id ?? "", roomTypeId: type?.id ?? "" };
  const [kept] = await env.db
    .insert(stay)
    .values([
      {
        ...base,
        roomUnitId: units[0]?.id ?? "",
        checkInDate: "2026-10-05",
        checkOutDate: "2026-10-07",
        nights: 2,
        nightlyPriceSatang: 80_000,
        roomTotalSatang: 160_000,
        status: "checked_in",
      },
      {
        ...base,
        roomUnitId: units[1]?.id ?? "",
        checkInDate: "2026-10-05",
        checkOutDate: "2026-10-06",
        nights: 1,
        nightlyPriceSatang: 80_000,
        roomTotalSatang: 80_000,
        status: "cancelled",
      },
    ])
    .returning();
  const [walk] = await env.db
    .insert(service)
    .values({ ...tenant, category: "hotel_addon", nameTh: "พาเดิน", scope: "hotel", isAddon: true, addonPerDay: true })
    .returning();
  await env.db.insert(stayAddon).values({
    organizationId: org.orgId,
    stayId: kept?.id ?? "",
    serviceId: walk?.id ?? "",
    nameSnapshot: "พาเดิน",
    unitPriceSatang: 10_000,
    quantity: 2,
    totalSatang: 20_000,
    addedByType: "staff",
  });
  const [day] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "09:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db.insert(daycareVisit).values([
    { ...base, sessionTypeId: day?.id ?? "", visitDate: "2026-10-08", priceSatang: 30_000, status: "reserved" },
    { ...base, sessionTypeId: day?.id ?? "", visitDate: "2026-10-09", priceSatang: 30_000, status: "no_show" },
  ]);
  return { bookingId: b?.id ?? "", stayId: kept?.id ?? "" };
}

it("adds stay_night (qty = nights), stay_addon and daycare lines, skipping cancelled and no-show children", async () => {
  const hotel = await seedHotel(env.base);
  const response = await post({ bookingIds: [hotel.bookingId] });
  expect(response.status).toBe(200);
  const detail = BillsOpenResponse.parse(await response.json());
  expect(detail.lines.map(({ id: _id, ...l }) => l)).toEqual([
    {
      lineType: "stay_night",
      description: "ห้องมาตรฐาน",
      petName: "Lucky",
      quantity: 2,
      unitPriceSatang: 80_000,
      lineDiscountSatang: 0,
      lineDiscountReason: null,
      lineTotalSatang: 160_000,
      performerId: null,
    },
    {
      lineType: "stay_addon",
      description: "พาเดิน",
      petName: "Lucky",
      quantity: 2,
      unitPriceSatang: 10_000,
      lineDiscountSatang: 0,
      lineDiscountReason: null,
      lineTotalSatang: 20_000,
      performerId: null,
    },
    {
      lineType: "daycare",
      description: "เต็มวัน",
      petName: "Lucky",
      quantity: 1,
      unitPriceSatang: 30_000,
      lineDiscountSatang: 0,
      lineDiscountReason: null,
      lineTotalSatang: 30_000,
      performerId: null,
    },
  ]);
  expect(detail).toMatchObject({ subtotalSatang: 210_000, totalSatang: 210_000, paidSatang: 0, dueSatang: 210_000 });
  const rows = await env.db.select().from(billLine).where(eq(billLine.billId, detail.id)).orderBy(asc(billLine.sortOrder));
  expect(rows.map((r) => [r.refType, r.sortOrder])).toEqual([
    ["stay", 0],
    ["stay_addon", 1],
    ["daycare_visit", 2],
  ]);
  expect(rows[0]?.refId).toBe(hotel.stayId);
});

it("bills grooming and hotel bookings of one customer together, groom lines first", async () => {
  const hotel = await seedHotel(env.base);
  const response = await post({ bookingIds: [s.bookingId, hotel.bookingId] });
  expect(response.status).toBe(200);
  const detail = BillsOpenResponse.parse(await response.json());
  const types = detail.lines.map((l) => l.lineType);
  expect(types.slice(-3)).toEqual(["stay_night", "stay_addon", "daycare"]);
  expect(types.indexOf("stay_night")).toBeGreaterThan(types.lastIndexOf("surcharge"));
  expect(detail.subtotalSatang).toBe(detail.lines.reduce((sum, l) => sum + l.lineTotalSatang, 0));
});
