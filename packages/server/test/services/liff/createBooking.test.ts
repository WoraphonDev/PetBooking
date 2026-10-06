// T-0177 liff.createBooking (grooming): R-04 re-check, R-12/R-11, R-06 deposit, R-08 status + deadlines, events, outbox.
import { LiffCreateBookingParams, LiffCreateBookingRequest, LiffCreateBookingResponse } from "@app/contracts/endpoints/liff.createBooking";
import {
  booking,
  bookingEvent,
  branch,
  branchHours,
  branchPolicy,
  customer,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  notification,
  ownerProfile,
  pet,
  petShopProfile,
  petVaccination,
  ratePlan,
  scheduledJob,
  service,
  servicePrice,
  sizeTier,
  staffUser,
  staffWorkingHours,
} from "@app/db/schema";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffCreateBooking } from "../../../src/services/liff/createBooking.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const TZ = "Asia/Bangkok";
const DATE = toLocalDate({ instant: new Date(Date.now() + 3 * 86_400_000).toISOString(), timezone: TZ });
const at = (time: string, date = DATE) => localToUtc({ date, time, timezone: TZ });

let env: TestEnv;
const POST = withCustomer("liff.createBooking", { params: LiffCreateBookingParams, body: LiffCreateBookingRequest }, liffCreateBooking);
type Shop = SeedOrg & { ids: Record<string, string>; token: string; label: string };

/** open 09:00–12:00 daily, groomers staff + owner on two stations, 30-min steps, bath 45 min ฿450 + nail 15 min ฿50 */
async function shop(label: string, policy: Partial<typeof branchPolicy.$inferInsert> = {}): Promise<Shop> {
  const s = await seedOrg(env.db, label);
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  await env.db
    .insert(branchHours)
    .values(
      Array.from({ length: 7 }, (_, weekday) => ({ branchId: s.branchId, weekday, isClosed: false, opensAt: "09:00", closesAt: "12:00" })),
    );
  await env.db.insert(branchPolicy).values({ branchId: s.branchId, slotStepMinutes: 30, bufferMinutes: 0, ...policy });
  const stations = await env.db
    .insert(groomStation)
    .values([
      { ...tenant, name: "T1", sortOrder: 1 },
      { ...tenant, name: "T2", sortOrder: 2 },
    ])
    .returning();
  for (const [i, id] of [s.staff.staff, s.staff.owner].entries()) {
    await env.db
      .update(staffUser)
      .set({ isGroomer: true, sortOrder: i + 1 })
      .where(eq(staffUser.id, id));
    await env.db
      .insert(staffWorkingHours)
      .values(Array.from({ length: 7 }, (_, weekday) => ({ ...tenant, staffUserId: id, weekday, startsAt: "09:00", endsAt: "12:00" })));
  }
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ปกติ", isDefault: true })
    .returning();
  const [tier] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000 })
    .returning();
  const [bath, nail, noPrice] = await env.db
    .insert(service)
    .values([
      { ...tenant, category: "bath", nameTh: "อาบน้ำ" },
      { ...tenant, category: "nail", nameTh: "ตัดเล็บ", isAddon: true },
      { ...tenant, category: "bath", nameTh: "พิเศษ" },
    ])
    .returning();
  const ids: Record<string, string> = {
    t1: stations[0]?.id ?? "",
    t2: stations[1]?.id ?? "",
    tier: tier?.id ?? "",
    bath: bath?.id ?? "",
    nail: nail?.id ?? "",
    noPrice: noPrice?.id ?? "",
  };
  const price = (serviceId: string, priceSatang: number, durationMinutes: number) => ({
    organizationId: s.orgId,
    serviceId,
    ratePlanId: plan?.id ?? "",
    sizeTierId: ids.tier ?? "",
    coatGroup: "any" as const,
    priceSatang,
    durationMinutes,
  });
  await env.db.insert(servicePrice).values([price(ids.bath ?? "", 45_000, 45), price(ids.nail ?? "", 5_000, 15)]);
  const pets = await env.db
    .insert(pet)
    .values([
      { ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "Mochi", species: "dog", latestWeightGrams: 4_000 },
      { ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "Kuma", species: "dog", latestWeightGrams: 5_000 },
    ])
    .returning();
  ids.mochi = pets[0]?.id ?? "";
  ids.kuma = pets[1]?.id ?? "";
  await env.db.insert(petShopProfile).values(pets.map((p) => ({ organizationId: s.orgId, petId: p.id })));
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return { ...s, ids, token, label };
}
const groom = (s: Shop, over: Record<string, unknown> = {}) => ({
  petId: s.ids.mochi,
  serviceIds: [s.ids.bath],
  addonIds: [s.ids.nail],
  startsAt: at("09:00"),
  ...over,
});
const call = (s: Shop, body: Record<string, unknown>) =>
  POST(
    new Request(`https://petbooking.test/api/v1/liff/shop-${s.label}/bookings`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(s.token)}` },
      body: JSON.stringify({ acceptedPolicy: true, ...body }),
    }),
    { params: { branchSlug: `shop-${s.label}` } },
  );
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const outbox = async (s: Shop) => (await env.db.select().from(notification)).filter((n) => n.organizationId === s.orgId);
const jobs = async (bookingId: string) =>
  (await env.db.select().from(scheduledJob)).filter((j) => (j.payload as { bookingId?: string }).bookingId === bookingId);

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("no deposit, auto-confirm: confirmed booking, appointment on the first free groomer, events, reminder, outbox", async () => {
  const s = await shop("cb1");
  const res = await call(s, { groom: [groom(s)], customerNote: "กลัวไดร์" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffCreateBookingResponse;
  expect(LiffCreateBookingResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    booking: { status: "confirmed", depositStatus: "not_required", estimatedTotalSatang: 50_000 },
    payment: null,
  });
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, body.booking.id));
  expect(bk).toMatchObject({
    channel: "line_liff",
    createdByType: "customer",
    createdById: s.customerId,
    status: "confirmed",
    customerNote: "กลัวไดร์",
    holdExpiresAt: null,
    approvalDueAt: null,
    firstServiceAt: new Date(at("09:00")),
  });
  const [appt] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.bookingId, body.booking.id));
  expect(appt).toMatchObject({
    petId: s.ids.mochi,
    groomerId: s.staff.staff,
    stationId: s.ids.t1,
    groomerPreference: "any",
    servicesTotalSatang: 50_000,
  });
  expect(appt?.endsAt.toISOString()).toBe(at("10:00"));
  const items = await env.db
    .select()
    .from(groomAppointmentItem)
    .where(eq(groomAppointmentItem.appointmentId, appt?.id ?? ""));
  expect(items.map((i) => [i.nameSnapshot, i.priceSatang]).sort()).toEqual([
    ["ตัดเล็บ", 5_000],
    ["อาบน้ำ", 45_000],
  ]);
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, body.booking.id));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus]).sort()).toEqual([
    ["booking", null, "confirmed"],
    ["groom_appointment", null, "scheduled"],
  ]);
  expect((await jobs(body.booking.id)).map((j) => j.jobType)).toEqual(["reminder_24h"]);
  const sent = await outbox(s);
  expect(sent.find((n) => n.templateKey === "customer.booking_confirmed")).toMatchObject({
    dedupeKey: `booking_confirmed:${body.booking.id}:${s.customerId}`,
  });
  expect(
    sent
      .filter((n) => n.templateKey === "staff.new_booking")
      .map((n) => n.dedupeKey)
      .sort(),
  ).toEqual([s.staff.front_desk, s.staff.owner].map((id) => `new_booking:${body.booking.id}:${id}`).sort());
});

it("deposit due: awaiting_deposit with hold + expire_hold, booking_received, PaymentInstruction", async () => {
  const s = await shop("cb2", { defaultDepositType: "percent", defaultDepositValue: 30, holdMinutes: 15 });
  await env.db
    .update(branch)
    .set({ promptpayType: "phone", promptpayId: "0812345678", promptpayAccountName: "ร้าน" })
    .where(eq(branch.id, s.branchId));
  const res = await call(s, { groom: [groom(s, { groomerId: s.staff.owner })] });
  const body = (await res.json()) as LiffCreateBookingResponse;
  expect(body.booking).toMatchObject({ status: "awaiting_deposit", depositStatus: "pending" });
  expect(body.payment).toMatchObject({ amountSatang: 15_000, accountName: "ร้าน" });
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, body.booking.id));
  expect(bk?.holdExpiresAt).not.toBeNull();
  const [appt] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.bookingId, body.booking.id));
  expect(appt).toMatchObject({ groomerId: s.staff.owner, groomerPreference: "specific" });
  expect((await jobs(body.booking.id)).map((j) => j.dedupeKey)).toContain(`expire_hold:${bk?.id}:${bk?.holdExpiresAt?.toISOString()}`);
  const received = (await outbox(s)).find((n) => n.templateKey === "customer.booking_received");
  expect(received).toMatchObject({ dedupeKey: `booking_received:${bk?.id}:${s.customerId}`, payload: { depositAmount: 15_000 } });
});

it("approval needed (auto-confirm off, or a vaccine still in review): awaiting_approval + approval_overdue", async () => {
  const s = await shop("cb3", { autoConfirmGrooming: false });
  const body = (await (await call(s, { groom: [groom(s)] })).json()) as LiffCreateBookingResponse;
  expect(body.booking.status).toBe("awaiting_approval");
  expect((await jobs(body.booking.id)).map((j) => j.dedupeKey)).toContain(`approval_overdue:${body.booking.id}:1`);
  const v = await shop("cb4", { enforceVaccinesGrooming: true, requiredVaccinesDog: ["DOG_RABIES"] });
  await env.db
    .insert(petVaccination)
    .values({ petId: v.ids.mochi ?? "", vaccineCode: "DOG_RABIES", expiresOn: "2099-01-01", status: "pending_review", source: "customer" });
  expect(((await (await call(v, { groom: [groom(v)] })).json()) as LiffCreateBookingResponse).booking.status).toBe("awaiting_approval");
  expect(await errorCode(await call(v, { groom: [groom(v, { petId: v.ids.kuma, startsAt: at("10:00") })] }))).toBe("VACCINE_REQUIRED");
});

it("two pets at the same time go to two groomers; a third → SLOT_TAKEN; the same pet twice → PET_ALREADY_BOOKED", async () => {
  const s = await shop("cb5");
  const body = (await (await call(s, { groom: [groom(s), groom(s, { petId: s.ids.kuma })] })).json()) as LiffCreateBookingResponse;
  const appts = await env.db.select().from(groomAppointment).where(eq(groomAppointment.bookingId, body.booking.id));
  expect(new Set(appts.map((a) => a.groomerId)).size).toBe(2);
  expect(new Set(appts.map((a) => a.stationId)).size).toBe(2);
  const [other] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "อื่น" }).returning();
  await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: other?.id ?? "" });
  expect(await errorCode(await call(s, { groom: [groom(s)] }))).toBe("PET_ALREADY_BOOKED");
  const [third] = await env.db
    .insert(pet)
    .values({ ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "Ume", species: "dog", latestWeightGrams: 3_000 })
    .returning();
  await env.db.insert(petShopProfile).values({ organizationId: s.orgId, petId: third?.id ?? "" });
  expect(await errorCode(await call(s, { groom: [groom(s, { petId: third?.id })] }))).toBe("SLOT_TAKEN");
});

it("outside the online window (past, beyond the horizon, inside the lead time) → OUTSIDE_BOOKING_WINDOW", async () => {
  const s = await shop("cb6");
  const far = toLocalDate({ instant: new Date(Date.now() + 90 * 86_400_000).toISOString(), timezone: TZ });
  const soon = new Date(Date.now() + 30 * 60_000).toISOString();
  for (const startsAt of [at("09:00", far), "2026-01-05T02:00:00.000Z", soon])
    expect(await errorCode(await call(s, { groom: [groom(s, { startsAt })] }))).toBe("OUTSIDE_BOOKING_WINDOW");
});

it("CUSTOMER_BLACKLISTED, PRICE_NOT_FOUND, MODULE_DISABLED (module off, or hotel / daycare items before M5)", async () => {
  const s = await shop("cb7");
  expect(await errorCode(await call(s, { groom: [groom(s, { serviceIds: [s.ids.noPrice], addonIds: [] })] }))).toBe("PRICE_NOT_FOUND");
  expect(await errorCode(await call(s, { daycare: [{ petId: s.ids.mochi, sessionTypeId: s.ids.t1, visitDate: DATE }] }))).toBe(
    "MODULE_DISABLED",
  );
  await env.db.update(customer).set({ blacklisted: true }).where(eq(customer.id, s.customerId));
  expect(await errorCode(await call(s, { groom: [groom(s)] }))).toBe("CUSTOMER_BLACKLISTED");
  await env.db.update(branch).set({ moduleGrooming: false }).where(eq(branch.id, s.branchId));
  expect(await errorCode(await call(s, { groom: [groom(s)] }))).toBe("MODULE_DISABLED");
  expect(await env.db.select().from(booking).where(eq(booking.customerId, s.customerId))).toEqual([]);
});

it("policy not accepted, a long note, nothing to book, bad items → VALIDATION_FAILED; another owner's pet → NOT_FOUND", async () => {
  const s = await shop("cb8");
  for (const body of [
    { groom: [groom(s)], acceptedPolicy: false },
    { groom: [groom(s)], customerNote: "x".repeat(301) },
    { groom: [] },
    { groom: [groom(s, { serviceIds: [] })] },
    { groom: [groom(s, { stationId: s.ids.t1 })] },
  ])
    expect(await errorCode(await call(s, body))).toBe("VALIDATION_FAILED");
  const [stranger] = await env.db.insert(ownerProfile).values({ createdInOrgId: s.orgId, firstName: "อื่น" }).returning();
  await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: stranger?.id ?? "" });
  const [theirs] = await env.db
    .insert(pet)
    .values({ ownerProfileId: stranger?.id ?? "", createdInOrgId: s.orgId, name: "x", species: "dog", latestWeightGrams: 3000 })
    .returning();
  await env.db.insert(petShopProfile).values({ organizationId: s.orgId, petId: theirs?.id ?? "" });
  expect(await errorCode(await call(s, { groom: [groom(s, { petId: theirs?.id })] }))).toBe("NOT_FOUND");
});
