import { BookingsCreateRequest, BookingsCreateResponse } from "@app/contracts/endpoints/bookings.create";
import {
  auditLog,
  booking,
  branch,
  branchClosure,
  branchHours,
  branchPolicy,
  customer,
  groomAppointment,
  groomAppointmentItem,
  groomStation,
  notification,
  pet,
  ratePlan,
  scheduledJob,
  service,
  servicePrice,
  sizeTier,
  staffUser,
  staffWorkingHours,
} from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsCreate } from "../../../src/services/bookings/create.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

// TEST_NOW = Mon 2026-10-05 10:00 Asia/Bangkok. Wed 2026-10-07 10:00 local = 03:00Z.
const WED_10 = "2026-10-07T03:00:00.000Z";
/** 11:30 local — after the 60-minute groom + 10-minute buffer from 10:00 */
const WED_11 = "2026-10-07T04:30:00.000Z";
let env: TestEnv;
let other: SeedOrg;
const ids = { station: "", bath: "", nails: "", catOnly: "", noPrice: "", tier: "", plan: "", mali: "", kiko: "" };
const POST = withStaff("bookings.create", { body: BookingsCreateRequest }, bookingsCreate);

async function addPet(values: Partial<typeof pet.$inferInsert> = {}, org: SeedOrg = env.base) {
  const [row] = await env.db
    .insert(pet)
    .values({
      ownerProfileId: org.ownerProfileId,
      createdInOrgId: org.orgId,
      name: "Pet",
      species: "dog",
      coatType: "short",
      latestWeightGrams: 4000,
      ...values,
    })
    .returning();
  return row?.id ?? "";
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TEST_NOW);
  env = await setupTestDb();
  other = await otherOrg(env.db);
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  await env.db
    .update(branch)
    .set({ promptpayType: "phone", promptpayId: "0812345678", promptpayAccountName: "ร้าน A" })
    .where(eq(branch.id, env.base.branchId));
  await env.db.insert(branchPolicy).values({
    branchId: env.base.branchId,
    slotStepMinutes: 30,
    bufferMinutes: 10,
    defaultDepositType: "percent",
    defaultDepositValue: 30,
    rejectedBreeds: ["Pitbull"],
    maxPetWeightGrams: 30_000,
    requiredVaccinesDog: ["rabies"],
  });
  // Mon + Wed open 09:00–18:00, Thu closed
  await env.db.insert(branchHours).values([
    { branchId: env.base.branchId, weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "18:00" },
    { branchId: env.base.branchId, weekday: 3, isClosed: false, opensAt: "09:00", closesAt: "18:00" },
    { branchId: env.base.branchId, weekday: 4, isClosed: true, opensAt: null, closesAt: null },
  ]);
  await env.db.update(staffUser).set({ isGroomer: true, sortOrder: 1 }).where(eq(staffUser.id, env.base.staff.staff));
  await env.db
    .insert(staffWorkingHours)
    .values([1, 3].map((weekday) => ({ ...tenant, staffUserId: env.base.staff.staff, weekday, startsAt: "09:00", endsAt: "18:00" })));
  const [st] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "โต๊ะ 1" })
    .returning();
  const [plan] = await env.db
    .insert(ratePlan)
    .values({ ...tenant, name: "ราคาปกติ" })
    .returning();
  const [tier] = await env.db
    .insert(sizeTier)
    .values({ ...tenant, species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: null })
    .returning();
  const [bath, nails, catOnly, noPrice] = await env.db
    .insert(service)
    .values([
      { ...tenant, nameTh: "อาบน้ำ", category: "bath" },
      { ...tenant, nameTh: "ตัดเล็บ", category: "nail", isAddon: true },
      { ...tenant, nameTh: "อาบน้ำแมว", category: "bath", speciesAllowed: ["cat"] },
      { ...tenant, nameTh: "สปา", category: "bath" },
    ])
    .returning();
  Object.assign(ids, {
    station: st?.id,
    plan: plan?.id,
    tier: tier?.id,
    bath: bath?.id,
    nails: nails?.id,
    catOnly: catOnly?.id,
    noPrice: noPrice?.id,
  });
  await env.db.insert(servicePrice).values(
    [
      [ids.bath, 30_000, 45],
      [ids.nails, 5_000, 15],
      [ids.catOnly, 30_000, 45],
    ].map(([serviceId, priceSatang, durationMinutes]) => ({
      organizationId: env.base.orgId,
      serviceId: serviceId as string,
      ratePlanId: ids.plan,
      sizeTierId: null,
      coatGroup: "any" as const,
      priceSatang: priceSatang as number,
      durationMinutes: durationMinutes as number,
    })),
  );
  ids.mali = await addPet({ name: "มะลิ" });
  ids.kiko = await addPet({ name: "กีโก้" });
});
afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  // booking_event / audit_log are append-only: earlier bookings stay, their appointments are released instead
  await env.db.update(groomAppointment).set({ status: "cancelled" });
  for (const t of [notification, scheduledJob]) await env.db.delete(t);
  await env.db.update(branch).set({ moduleGrooming: true }).where(eq(branch.id, env.base.branchId));
  await env.db.update(branchPolicy).set({ enforceVaccinesGrooming: false }).where(eq(branchPolicy.branchId, env.base.branchId));
  await env.db.update(customer).set({ depositExempt: false }).where(eq(customer.id, env.base.customerId));
  await env.db.delete(branchClosure);
  resetRateLimits();
});
const bookingsOf = async () => (await env.db.select().from(booking)).length;
const nextNo = async () => {
  const [b] = await env.db.select().from(branch).where(eq(branch.id, env.base.branchId));
  return `B6910-${String(b?.bookingNextSeq ?? 1).padStart(4, "0")}`;
};

const groom = (over: Record<string, unknown> = {}) => ({
  petId: ids.mali,
  serviceIds: [ids.bath],
  addonIds: [ids.nails],
  startsAt: WED_10,
  groomerId: env.base.staff.staff,
  stationId: ids.station,
  groomerPreference: "any",
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({ customerId: env.base.customerId, channel: "walk_in", groom: [groom()], ...over });

async function post(input: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/bookings", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("creates a confirmed grooming booking with snapshots, events, reminder job and booking_confirmed outbox", async () => {
  const expectedNo = await nextNo();
  const res = await post(body({ customerNote: "ขนพันกัน" }));
  expect(res.status).toBe(200);
  const detail = BookingsCreateResponse.parse(await res.json());
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, detail.id));
  expect(bk).toMatchObject({
    id: detail.id,
    customerId: env.base.customerId,
    bookingNo: expectedNo,
    channel: "walk_in",
    status: "confirmed",
    createdByType: "staff",
    createdById: env.base.staff.front_desk,
    estimatedTotalSatang: 35_000,
    // R-06 percent 30 of 350 บาท = 105 บาท
    depositRequiredSatang: 10_500,
    depositStatus: "pending",
    customerNote: "ขนพันกัน",
    confirmedAt: TEST_NOW,
    firstServiceAt: new Date(WED_10),
  });
  expect(bk?.policySnapshot).toMatchObject({ bufferMinutes: 10, defaultDepositType: "percent", defaultDepositValue: 30 });
  const [appt] = await env.db.select().from(groomAppointment).where(eq(groomAppointment.bookingId, detail.id));
  expect(appt).toMatchObject({
    bookingId: detail.id,
    petId: ids.mali,
    groomerId: env.base.staff.staff,
    groomerPreference: "any",
    stationId: ids.station,
    startsAt: new Date(WED_10),
    endsAt: new Date("2026-10-07T04:00:00.000Z"),
    blockedUntil: new Date("2026-10-07T04:10:00.000Z"),
    status: "scheduled",
    sizeTierId: ids.tier,
    weightGramsAtBooking: 4000,
    servicesTotalSatang: 35_000,
  });
  const items = await env.db
    .select()
    .from(groomAppointmentItem)
    .where(eq(groomAppointmentItem.appointmentId, appt?.id ?? ""))
    .orderBy(asc(groomAppointmentItem.isAddon));
  expect(
    items.map(({ serviceId, nameSnapshot, isAddon, priceSatang, durationMinutes, customerPackageId }) => ({
      serviceId,
      nameSnapshot,
      isAddon,
      priceSatang,
      durationMinutes,
      customerPackageId,
    })),
  ).toEqual([
    { serviceId: ids.bath, nameSnapshot: "อาบน้ำ", isAddon: false, priceSatang: 30_000, durationMinutes: 45, customerPackageId: null },
    { serviceId: ids.nails, nameSnapshot: "ตัดเล็บ", isAddon: true, priceSatang: 5_000, durationMinutes: 15, customerPackageId: null },
  ]);
  expect(detail.events.map((e) => [e.entityType, e.fromStatus, e.toStatus, e.actorType])).toEqual([
    ["booking", null, "confirmed", "staff"],
    ["groom_appointment", null, "scheduled", "staff"],
  ]);
  const [job] = await env.db.select().from(scheduledJob);
  expect(job).toMatchObject({
    jobType: "reminder_24h",
    runAt: new Date("2026-10-06T03:00:00.000Z"),
    payload: { bookingId: detail.id, entityType: "groom_appointment", entityId: appt?.id },
    dedupeKey: `reminder_24h:${appt?.id}:${WED_10}`,
  });
  const [note] = await env.db.select().from(notification);
  expect(note).toMatchObject({
    templateKey: "customer.booking_confirmed",
    recipientType: "customer",
    recipientId: env.base.customerId,
    dedupeKey: `booking_confirmed:${detail.id}:${env.base.customerId}`,
  });
  expect(note?.payload).toMatchObject({ bookingNo: expectedNo, summary: "มะลิ: อาบน้ำ, ตัดเล็บ", shopName: "Shop a" });
  expect(detail).toMatchObject({
    bookingNo: expectedNo,
    customer: { id: env.base.customerId },
    groom: [{ pet: { id: ids.mali }, groomerName: "staff", stationName: "โต๊ะ 1", servicesTotalSatang: 35_000, depositStatus: "pending" }],
    stays: [],
    daycare: [],
    slips: [],
    payment: { amountSatang: 10_500, accountName: "ร้าน A", promptpayIdMasked: "678", expiresAt: null },
  });
  expect(detail.payment?.promptpayPayload).toMatch(/^000201/);
  expect(detail.warnings).toBeUndefined();
});

it("numbers bookings per branch and month (R-23)", async () => {
  const first = BookingsCreateResponse.parse(await (await post(body())).json());
  const second = BookingsCreateResponse.parse(await (await post(body({ groom: [groom({ petId: ids.kiko, startsAt: WED_11 })] }))).json());
  expect(first.bookingNo).toMatch(/^B6910-\d{4}$/);
  expect(Number(second.bookingNo.slice(6))).toBe(Number(first.bookingNo.slice(6)) + 1);
});

it("books several pets in one booking; the earlier pet blocks its slot for the next", async () => {
  const res = await post(body({ groom: [groom(), groom({ petId: ids.kiko, startsAt: WED_10 })] }));
  expect(await codeOf(res)).toBe("SLOT_TAKEN");
  const ok = BookingsCreateResponse.parse(
    await (await post(body({ groom: [groom(), groom({ petId: ids.kiko, startsAt: WED_11 })] }))).json(),
  );
  expect(ok.groom.map((g) => g.pet.id)).toEqual([ids.mali, ids.kiko]);
  expect(ok.firstServiceAt).toBe(WED_10);
});

it("SLOT_TAKEN when the groomer/station/time is not an R-04 slot", async () => {
  await post(body());
  const before = await bookingsOf();
  expect(await codeOf(await post(body({ groom: [groom({ petId: ids.kiko })] })))).toBe("SLOT_TAKEN");
  // not on the slot grid
  expect(await codeOf(await post(body({ groom: [groom({ petId: ids.kiko, startsAt: "2026-10-07T04:10:00.000Z" })] })))).toBe("SLOT_TAKEN");
  expect(await bookingsOf()).toBe(before);
});

it("PET_ALREADY_BOOKED when the pet already has an overlapping grooming appointment", async () => {
  await post(body());
  expect(await codeOf(await post(body({ groom: [groom({ startsAt: "2026-10-07T03:30:00.000Z" })] })))).toBe("PET_ALREADY_BOOKED");
});

it("PRICE_NOT_FOUND when a service has no price for the pet", async () => {
  expect(await codeOf(await post(body({ groom: [groom({ serviceIds: [ids.noPrice] })] })))).toBe("PRICE_NOT_FOUND");
});

it.each([
  ["PET_INACTIVE", { status: "deceased" }, {}],
  ["SPECIES_NOT_ALLOWED", {}, { serviceIds: [ids.catOnly] }],
  ["BREED_REJECTED", { breed: " pitbull " }, {}],
  ["PET_TOO_HEAVY", { latestWeightGrams: 35_000 }, {}],
] as const)("R-12 %s", async (code, petValues, over) => {
  const petId = await addPet(petValues);
  const before = await bookingsOf();
  const serviceIds = code === "SPECIES_NOT_ALLOWED" ? [ids.catOnly] : [ids.bath];
  expect(await codeOf(await post(body({ groom: [groom({ petId, ...over, serviceIds })] })))).toBe(code);
  expect(await bookingsOf()).toBe(before);
});

it("MODULE_DISABLED when grooming is off for the branch", async () => {
  await env.db.update(branch).set({ moduleGrooming: false }).where(eq(branch.id, env.base.branchId));
  expect(await codeOf(await post(body()))).toBe("MODULE_DISABLED");
});

it("BRANCH_CLOSED on a closed weekday or inside a grooming closure", async () => {
  expect(await codeOf(await post(body({ groom: [groom({ startsAt: "2026-10-08T03:00:00.000Z" })] })))).toBe("BRANCH_CLOSED");
  await env.db.insert(branchClosure).values({
    branchId: env.base.branchId,
    startsAt: new Date("2026-10-07T02:30:00.000Z"),
    endsAt: new Date("2026-10-07T05:00:00.000Z"),
    scope: "grooming",
    reason: "อบรม",
  });
  expect(await codeOf(await post(body()))).toBe("BRANCH_CLOSED");
});

it.each([
  ["missing channel", { channel: undefined }],
  ["channel not for the shop", { channel: "line_liff" }],
  ["note over 500", { customerNote: "x".repeat(501) }],
  ["no items", { groom: [] }],
  ["override without reason", { depositOverride: { amountSatang: 0 } }],
  [
    "stays are T-0271",
    {
      stays: [
        {
          petId: "00000000-0000-4000-8000-000000000001",
          roomTypeId: "00000000-0000-4000-8000-000000000002",
          checkInDate: "2026-10-07",
          checkOutDate: "2026-10-08",
        },
      ],
    },
  ],
])("VALIDATION_FAILED: %s", async (_name, over) => {
  expect(await codeOf(await post(body(over)))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN", async () => {
  expect(await codeOf(await post(body(), "staff"))).toBe("FORBIDDEN");
});

it("another org's customer or pet → NOT_FOUND", async () => {
  expect(await codeOf(await post(body({ customerId: other.customerId })))).toBe("NOT_FOUND");
  const foreignPet = await addPet({}, other);
  expect(await codeOf(await post(body({ groom: [groom({ petId: foreignPet })] })))).toBe("NOT_FOUND");
});

it("deposit override 0 waives the deposit and writes audit deposit.waive in the same transaction", async () => {
  const detail = BookingsCreateResponse.parse(
    await (await post(body({ depositOverride: { amountSatang: 0, reason: "ลูกค้าประจำ" } }))).json(),
  );
  expect(detail).toMatchObject({ depositRequiredSatang: 0, depositStatus: "not_required", payment: null });
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, detail.id));
  expect(audit).toMatchObject({
    action: "deposit.waive",
    entityType: "booking",
    entityId: detail.id,
    reason: "ลูกค้าประจำ",
    before: { depositRequiredSatang: 10_500 },
    after: { depositRequiredSatang: 0 },
  });
});

it("an exempt customer has no deposit and no audit", async () => {
  await env.db.update(customer).set({ depositExempt: true }).where(eq(customer.id, env.base.customerId));
  const detail = BookingsCreateResponse.parse(await (await post(body())).json());
  expect(detail.depositStatus).toBe("not_required");
  expect(await env.db.select().from(auditLog).where(eq(auditLog.entityId, detail.id))).toEqual([]);
});

it("R-11 not passed is only a warning when the branch enforces vaccines for grooming", async () => {
  await env.db.update(branchPolicy).set({ enforceVaccinesGrooming: true }).where(eq(branchPolicy.branchId, env.base.branchId));
  const res = await post(body());
  expect(res.status).toBe(200);
  const detail = BookingsCreateResponse.parse(await res.json());
  expect(detail.status).toBe("confirmed");
  expect(detail.warnings).toEqual([
    {
      code: "VACCINE_REQUIRED",
      message: expect.any(String),
      data: { petId: ids.mali, missing: ["rabies"], expired: [], pendingReview: [] },
    },
  ]);
});

it("does not set reminder_24h for an appointment less than 24 h away", async () => {
  // today 14:00 local
  const res = await post(body({ groom: [groom({ startsAt: "2026-10-05T07:00:00.000Z" })] }));
  expect(res.status).toBe(200);
  expect(await env.db.select().from(scheduledJob)).toEqual([]);
});
