import { CustomersGetRequest, CustomersGetResponse } from "@app/contracts/endpoints/customers.get";
import {
  bill,
  billLine,
  booking,
  branchPolicy,
  customer,
  customerPackage,
  daycareSessionType,
  daycareVisit,
  lineIdentity,
  ownerProfile,
  packageRedemption,
  packageTemplate,
  pet,
  petTemperamentFlag,
  petVaccination,
  service,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { customersGet } from "../../../src/services/customers/get.ts";
import { customerCtx, otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

// TEST_NOW = 2026-10-05T03:00Z → local day 2026-10-05 (Asia/Bangkok)
const GET = withStaff("customers.get", { params: CustomersGetRequest }, customersGet);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestDb();
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  foreign = await otherOrg(env.db);

  await env.db
    .update(ownerProfile)
    .set({
      firstName: "สมชาย",
      lastName: "ใจดี",
      nickname: "ชาย",
      phoneE164: "+66812345678",
      email: "somchai@example.test",
      birthDate: "1990-01-02",
      addressLine: "1/2 ซอยสุข",
      subdistrict: "คลองตัน",
      district: "คลองเตย",
      province: "กรุงเทพมหานคร",
      postalCode: "10110",
    })
    .where(eq(ownerProfile.id, org.ownerProfileId));
  await env.db
    .update(customer)
    .set({
      sourceChannel: "line_liff",
      referralNote: "เพื่อนแนะนำ",
      emergencyContactName: "สมหญิง",
      emergencyContactPhone: "+66899999999",
      internalNote: "ชอบนัดเช้า",
      reliabilityLevel: 2,
      reliabilityOverride: 3,
      lateCancelCount12m: 1,
      noShowCount12m: 2,
      blacklisted: true,
      blacklistReason: "ไม่มาสองครั้ง",
      depositExempt: true,
      photoConsent: "granted",
      visitCount: 7,
      firstVisitAt: new Date("2025-01-01T03:00:00.000Z"),
      lastVisitAt: new Date("2026-09-01T03:00:00.000Z"),
      creditBalanceSatang: 12_500,
    })
    .where(eq(customer.id, org.customerId));
  await env.db.insert(lineIdentity).values({
    providerId: "p1",
    lineUserId: "U1",
    ownerProfileId: org.ownerProfileId,
    displayName: "Somchai LINE",
    pictureUrl: "https://profile.line-scdn.test/u1",
    isFriend: true,
  });
  await env.db
    .insert(branchPolicy)
    .values({ branchId: org.branchId, requiredVaccinesDog: ["DOG_DHPPL", "DOG_RABIES"], requiredVaccinesCat: ["CAT_FVRCP"] });

  const [mochi, kuma, tama] = await env.db
    .insert(pet)
    .values([
      {
        ownerProfileId: org.ownerProfileId,
        createdInOrgId: org.orgId,
        name: "Mochi",
        species: "dog",
        breed: "Poodle",
        sex: "female",
        coatType: "curly",
        latestWeightGrams: 4_500,
        birthDate: "2024-08-10",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        ownerProfileId: org.ownerProfileId,
        createdInOrgId: org.orgId,
        name: "Kuma",
        species: "cat",
        ageEstimateMonths: 12,
        status: "deceased",
        createdAt: new Date("2026-04-05T00:00:00Z"),
      },
      {
        ownerProfileId: org.ownerProfileId,
        createdInOrgId: org.orgId,
        name: "Tama",
        species: "dog",
        createdAt: new Date("2026-05-01T00:00:00Z"),
      },
    ])
    .returning();
  ids.mochi = mochi?.id ?? "";
  ids.kuma = kuma?.id ?? "";
  ids.tama = tama?.id ?? "";
  // Mochi: both verified and valid → ok; Kuma: pending review → warning; Tama: nothing → missing
  await env.db.insert(petVaccination).values([
    { petId: ids.mochi, vaccineCode: "DOG_DHPPL", expiresOn: "2026-10-05", status: "verified" },
    { petId: ids.mochi, vaccineCode: "DOG_RABIES", expiresOn: "2027-01-01", status: "verified" },
    { petId: ids.kuma, vaccineCode: "CAT_FVRCP", expiresOn: "2027-01-01", status: "pending_review" },
    { petId: ids.tama, vaccineCode: "DOG_RABIES", expiresOn: "2027-01-01", status: "rejected" },
  ]);
  await env.db.insert(petTemperamentFlag).values([
    { organizationId: org.orgId, petId: ids.mochi, flag: "bites" },
    { organizationId: org.orgId, petId: ids.mochi, flag: "anxious" },
    // another shop's flag is not shown here
    { organizationId: foreign.orgId, petId: ids.mochi, flag: "dryer_fear" },
  ]);

  // package with one redemption
  const [svc] = await env.db
    .insert(service)
    .values({ ...tenant, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [tpl] = await env.db
    .insert(packageTemplate)
    .values({ ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: svc?.id ?? "", sessionsCount: 5, priceSatang: 200_000 })
    .returning();
  const [b] = await env.db
    .insert(bill)
    .values({ ...tenant, openedBy: org.staff.owner, receiptNo: "R6910-0001" })
    .returning();
  const [line] = await env.db
    .insert(billLine)
    .values({
      organizationId: org.orgId,
      billId: b?.id ?? "",
      lineType: "package_redemption",
      description: "ใช้แพ็กเกจ",
      unitPriceSatang: 0,
      lineTotalSatang: 0,
    })
    .returning();
  const [active, ,] = await env.db
    .insert(customerPackage)
    .values([
      {
        organizationId: org.orgId,
        customerId: org.customerId,
        templateId: tpl?.id ?? "",
        petId: ids.mochi,
        sessionsTotal: 5,
        sessionsUsed: 1,
        unitValueSatang: 40_000,
        purchasedBillId: b?.id ?? "",
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
      {
        organizationId: org.orgId,
        customerId: org.customerId,
        templateId: tpl?.id ?? "",
        sessionsTotal: 5,
        sessionsUsed: 5,
        unitValueSatang: 40_000,
        purchasedBillId: b?.id ?? "",
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        status: "exhausted",
      },
    ])
    .returning();
  ids.package = active?.id ?? "";
  await env.db.insert(packageRedemption).values({
    organizationId: org.orgId,
    customerPackageId: ids.package,
    billLineId: line?.id ?? "",
    petId: ids.mochi,
    performerId: org.staff.staff,
    redeemedAt: new Date("2026-09-01T04:00:00.000Z"),
  });

  // bookings: one upcoming (with a daycare visit), one past, one cancelled future
  const newBooking = async (bookingNo: string, status: "confirmed" | "cancelled", firstServiceAt: string) => {
    const [row] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: org.customerId,
        bookingNo,
        channel: "line_liff",
        createdByType: "customer",
        status,
        policySnapshot: {},
        estimatedTotalSatang: 50_000,
        firstServiceAt: new Date(firstServiceAt),
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      })
      .returning();
    return row?.id ?? "";
  };
  ids.upcoming = await newBooking("B6910-0001", "confirmed", "2026-10-10T02:00:00.000Z");
  await newBooking("B6909-0001", "confirmed", "2026-09-10T02:00:00.000Z");
  await newBooking("B6910-0002", "cancelled", "2026-10-11T02:00:00.000Z");
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db.insert(daycareVisit).values({
    ...tenant,
    bookingId: ids.upcoming,
    petId: ids.mochi,
    sessionTypeId: session?.id ?? "",
    visitDate: "2026-10-10",
    priceSatang: 50_000,
  });
});
afterAll(async () => {
  await env.close();
});

async function get(customerId: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/customers/${customerId}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: Promise.resolve({ customerId }),
  });
}

const full = () => ({
  id: env.base.customerId,
  ownerProfileId: env.base.ownerProfileId,
  firstName: "สมชาย",
  lastName: "ใจดี",
  nickname: "ชาย",
  phone: "+66812345678",
  email: "somchai@example.test",
  birthDate: "1990-01-02",
  addressLine: "1/2 ซอยสุข",
  subdistrict: "คลองตัน",
  district: "คลองเตย",
  province: "กรุงเทพมหานคร",
  postalCode: "10110",
  sourceChannel: "line_liff",
  referralNote: "เพื่อนแนะนำ",
  emergencyContactName: "สมหญิง",
  emergencyContactPhone: "+66899999999",
  internalNote: "ชอบนัดเช้า",
  reliabilityLevel: 2,
  reliabilityOverride: 3,
  lateCancelCount12m: 1,
  noShowCount12m: 2,
  blacklisted: true,
  blacklistReason: "ไม่มาสองครั้ง",
  depositExempt: true,
  photoConsent: "granted",
  visitCount: 7,
  firstVisitAt: "2025-01-01T03:00:00.000Z",
  lastVisitAt: "2026-09-01T03:00:00.000Z",
  creditBalanceSatang: 12_500,
  line: { displayName: "Somchai LINE", pictureUrl: "https://profile.line-scdn.test/u1", isFriend: true },
  pets: [
    {
      id: ids.mochi,
      name: "Mochi",
      species: "dog",
      breed: "Poodle",
      sex: "female",
      coatType: "curly",
      latestWeightGrams: 4_500,
      status: "active",
      photoUrl: null,
      flags: ["bites", "anxious"],
      ageMonths: 25,
      vaccineStatus: "ok",
    },
    {
      id: ids.kuma,
      name: "Kuma",
      species: "cat",
      breed: null,
      sex: "unknown",
      coatType: "unknown",
      latestWeightGrams: null,
      status: "deceased",
      photoUrl: null,
      flags: [],
      // 12 months estimated on 2026-04-05 + 6 full months
      ageMonths: 18,
      vaccineStatus: "warning",
    },
    {
      id: ids.tama,
      name: "Tama",
      species: "dog",
      breed: null,
      sex: "unknown",
      coatType: "unknown",
      latestWeightGrams: null,
      status: "active",
      photoUrl: null,
      flags: [],
      ageMonths: null,
      vaccineStatus: "missing",
    },
  ],
  activePackages: [
    {
      id: ids.package,
      templateName: "อาบ 5 ครั้ง",
      petId: ids.mochi,
      petName: "Mochi",
      sessionsTotal: 5,
      sessionsUsed: 1,
      sessionsLeft: 4,
      expiresAt: "2027-01-01T00:00:00.000Z",
      status: "active",
      redemptions: [
        { redeemedAt: "2026-09-01T04:00:00.000Z", petName: "Mochi", performerName: "staff", receiptNo: "R6910-0001", reversedAt: null },
      ],
    },
  ],
  upcomingBookings: [
    {
      id: ids.upcoming,
      bookingNo: "B6910-0001",
      status: "confirmed",
      channel: "line_liff",
      customerId: env.base.customerId,
      customerName: "สมชาย (ชาย)",
      firstServiceAt: "2026-10-10T02:00:00.000Z",
      modules: ["daycare"],
      petNames: ["Mochi"],
      estimatedTotalSatang: 50_000,
      depositStatus: "not_required",
      depositRequiredSatang: 0,
      holdExpiresAt: null,
      approvalDueAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
});

it("maps every CustomerDetail field for owner and front_desk", async () => {
  for (const role of ["owner", "front_desk"] as const) {
    // via the service so ctx.now is the fixed TEST_NOW (ages, vaccine validity, upcoming bookings)
    expect(await customersGet(staffCtx(env.base, role), { customerId: env.base.customerId })).toEqual(full());
    const response = await get(env.base.customerId, role);
    expect(response.status).toBe(200);
    expect(CustomersGetResponse.parse(await response.json()).id).toBe(env.base.customerId);
  }
});

it("leaves phone, email, address, internalNote and creditBalance out for role staff", async () => {
  const response = await get(env.base.customerId, "staff");
  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  for (const key of [
    "phone",
    "email",
    "addressLine",
    "subdistrict",
    "district",
    "province",
    "postalCode",
    "internalNote",
    "creditBalanceSatang",
  ])
    expect(body, key).not.toHaveProperty(key);
  const {
    phone: _p,
    email: _e,
    addressLine: _a,
    subdistrict: _s,
    district: _d,
    province: _pr,
    postalCode: _pc,
    internalNote: _n,
    creditBalanceSatang: _c,
    ...visible
  } = full();
  expect(await customersGet(staffCtx(env.base, "staff"), { customerId: env.base.customerId })).toEqual(visible);
});

it("returns line null when no LINE account is linked", async () => {
  expect((await customersGet(staffCtx(foreign, "owner"), { customerId: foreign.customerId })).line).toBeNull();
});

it("rejects a malformed customerId with VALIDATION_FAILED", async () => {
  const response = await get("not-a-uuid");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("denies customer actors", async () => {
  await expect(customersGet(customerCtx(env.base), { customerId: env.base.customerId })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("returns NOT_FOUND for another organization's customer or an unknown id", async () => {
  for (const customerId of [foreign.customerId, "00000000-0000-4000-8000-000000000000"]) {
    const response = await get(customerId);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  }
});
