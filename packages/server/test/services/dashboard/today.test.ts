import { DashboardTodayRequest, DashboardTodayResponse } from "@app/contracts/endpoints/dashboard.today";
import {
  bill,
  booking,
  careTask,
  customerLinkRequest,
  daycareSessionType,
  daycareVisit,
  fileObject,
  groomAppointment,
  groomStation,
  lineIdentity,
  notification,
  ownerProfile,
  payment,
  paymentSlip,
  pet,
  reportCard,
  roomType,
  roomUnit,
  stay,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { dashboardToday } from "../../../src/services/dashboard/today.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

// TEST_NOW = 2026-10-05T03:00Z = 10:00 on 5 Oct in Bangkok; the local day is [2026-10-04T17:00Z, 2026-10-05T17:00Z)
const GET = withStaff("dashboard.today", { query: DashboardTodayRequest }, dashboardToday);
let env: TestEnv;
const at = (iso: string) => new Date(iso);

async function seed(org: SeedOrg, tag: string) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: `Mochi ${tag}`, species: "dog" })
    .returning();
  const petId = mochi?.id ?? "";
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: `T-${tag}` })
    .returning();
  const newBooking = async (no: string, extra: Partial<typeof booking.$inferInsert> = {}) => {
    const [b] = await env.db
      .insert(booking)
      .values({
        ...tenant,
        customerId: org.customerId,
        bookingNo: `${tag}-${no}`,
        channel: "walk_in",
        createdByType: "staff",
        status: "confirmed",
        policySnapshot: {},
        ...extra,
      })
      .returning();
    return b?.id ?? "";
  };
  const [paidBill] = await env.db
    .insert(bill)
    .values([
      { ...tenant, openedBy: org.staff.owner, status: "paid", closedAt: at("2026-10-05T02:00:00Z") },
      { ...tenant, openedBy: org.staff.owner, status: "paid", closedAt: at("2026-10-04T16:59:00Z") }, // 4 Oct 23:59 local
      { ...tenant, openedBy: org.staff.owner, status: "open" },
    ])
    .returning();
  const unbilled = await newBooking("1");
  const billed = await newBooking("2", { billId: paidBill?.id ?? null });
  await newBooking("3", { status: "awaiting_approval" });
  const appt = (bookingId: string, startsAt: string, status: typeof groomAppointment.$inferInsert.status, pickedUpAt?: string) => ({
    ...tenant,
    bookingId,
    petId,
    groomerId: org.staff.staff,
    stationId: station?.id ?? "",
    startsAt: at(startsAt),
    endsAt: at(new Date(Date.parse(startsAt) + 30 * 60_000).toISOString()),
    blockedUntil: at(new Date(Date.parse(startsAt) + 30 * 60_000).toISOString()),
    status,
    pickedUpAt: pickedUpAt ? at(pickedUpAt) : null,
  });
  const appts = await env.db
    .insert(groomAppointment)
    .values([
      appt(unbilled, "2026-10-04T17:00:00Z", "scheduled"), // 00:00 local — today
      appt(unbilled, "2026-10-05T01:00:00Z", "done"),
      appt(unbilled, "2026-10-05T02:00:00Z", "picked_up", "2026-10-05T02:45:00Z"), // pickup without bill
      appt(billed, "2026-10-05T04:00:00Z", "picked_up", "2026-10-05T04:45:00Z"), // has a bill
      appt(unbilled, "2026-10-05T05:00:00Z", "cancelled"),
      appt(unbilled, "2026-10-04T16:00:00Z", "done"), // 4 Oct 23:00 local — yesterday
    ])
    .returning();
  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: `Room ${tag}` })
    .returning();
  const units = await env.db
    .insert(roomUnit)
    .values(
      ["R1", "R2", "R3", "R4"].map((code, i) => ({
        ...tenant,
        roomTypeId: type?.id ?? "",
        code,
        status: i === 3 ? ("maintenance" as const) : ("active" as const),
      })),
    )
    .returning();
  const room = (unit: number, checkInDate: string, checkOutDate: string, status: typeof stay.$inferInsert.status) => ({
    ...tenant,
    bookingId: unbilled,
    petId,
    roomTypeId: type?.id ?? "",
    roomUnitId: units[unit]?.id ?? "",
    checkInDate,
    checkOutDate,
    expectedCheckInTime: "09:00",
    nights: (Date.parse(checkOutDate) - Date.parse(checkInDate)) / 86_400_000,
    nightlyPriceSatang: 0,
    roomTotalSatang: 0,
    status,
  });
  const stays = await env.db
    .insert(stay)
    .values([
      room(0, "2026-10-05", "2026-10-06", "reserved"),
      room(1, "2026-10-03", "2026-10-05", "checked_in"),
      room(2, "2026-10-05", "2026-10-07", "cancelled"),
    ])
    .returning();
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: `Day ${tag}`, startsAt: "09:00", endsAt: "18:00", capacity: 10 })
    .returning();
  const visit = (visitDate: string, status: typeof daycareVisit.$inferInsert.status) => ({
    ...tenant,
    bookingId: unbilled,
    petId,
    sessionTypeId: session?.id ?? "",
    visitDate,
    priceSatang: 0,
    status,
  });
  await env.db
    .insert(daycareVisit)
    .values([visit("2026-10-05", "reserved"), visit("2026-10-05", "cancelled"), visit("2026-10-06", "reserved")]);
  const pay = (
    method: typeof payment.$inferInsert.method,
    amountSatang: number,
    receivedAt: string,
    status: "posted" | "voided" = "posted",
  ) => ({
    ...tenant,
    billId: paidBill?.id ?? null,
    method,
    amountSatang,
    receivedAt: at(receivedAt),
    status,
  });
  await env.db
    .insert(payment)
    .values([
      pay("cash", 50_000, "2026-10-05T02:00:00Z"),
      pay("promptpay", 20_000, "2026-10-04T17:30:00Z"),
      pay("deposit", 30_000, "2026-10-05T02:00:00Z"),
      pay("credit", 10_000, "2026-10-05T02:00:00Z"),
      pay("cash", 7_000, "2026-10-05T02:00:00Z", "voided"),
      pay("cash", 9_000, "2026-10-04T16:00:00Z"),
    ]);
  const [file] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind: "slip",
      storageKey: `k-${tag}`,
      mimeType: "image/png",
      sizeBytes: 1,
      uploadedByType: "customer",
    })
    .returning();
  await env.db.insert(paymentSlip).values(
    (["submitted", "verified"] as const).map((status) => ({
      ...tenant,
      fileId: file?.id ?? "",
      uploadedByType: "customer" as const,
      amountExpectedSatang: 1,
      status,
    })),
  );
  const task = (dueAt: string, status: typeof careTask.$inferInsert.status) => ({
    ...tenant,
    stayId: stays[1]?.id ?? "",
    taskType: "feed" as const,
    title: "ให้อาหาร",
    dueAt: at(dueAt),
    status,
  });
  await env.db
    .insert(careTask)
    .values([task("2026-10-05T02:00:00Z", "pending"), task("2026-10-05T04:00:00Z", "pending"), task("2026-10-05T01:00:00Z", "done")]);
  await env.db.insert(reportCard).values(
    (["pending_review", "sent", "draft"] as const).map((status, i) => ({
      ...tenant,
      kind: "grooming" as const,
      appointmentId: appts[i]?.id ?? null,
      petId,
      customerId: org.customerId,
      createdBy: org.staff.staff,
      status,
    })),
  );
  const message = (dedupeKey: string, status: "skipped" | "sent", createdAt: string) => ({
    ...tenant,
    recipientType: "customer" as const,
    recipientId: org.customerId,
    channel: "line_push" as const,
    templateKey: "customer.booking_confirmed",
    payload: {},
    dedupeKey: `${tag}-${dedupeKey}`,
    monthKey: "2026-10",
    status,
    createdAt: at(createdAt),
  });
  await env.db
    .insert(notification)
    .values([
      message("a", "skipped", "2026-10-05T02:00:00Z"),
      message("b", "skipped", "2026-10-04T16:00:00Z"),
      message("c", "sent", "2026-10-05T02:00:00Z"),
    ]);
  for (const status of ["pending", "rejected"] as const) {
    const [profile] = await env.db
      .insert(ownerProfile)
      .values({ createdInOrgId: org.orgId, firstName: `New ${tag} ${status}` })
      .returning();
    const [identity] = await env.db
      .insert(lineIdentity)
      .values({ providerId: "p1", lineUserId: `U-${tag}-${status}`, ownerProfileId: profile?.id ?? "", displayName: "Line" })
      .returning();
    await env.db.insert(customerLinkRequest).values({
      organizationId: org.orgId,
      lineIdentityId: identity?.id ?? "",
      newOwnerProfileId: profile?.id ?? "",
      candidateCustomerId: org.customerId,
      phoneEntered: "+66812345678",
      status,
    });
  }
}

beforeAll(async () => {
  env = await setupTestDb();
  await seed(env.base, "a");
  await seed(await otherOrg(env.db), "b"); // identical data in another organization must not be counted
}, 60_000);
afterAll(() => env.close());
beforeEach(() => {
  resetRateLimits();
  // the HTTP pipeline reads the clock once per request: pin it to TEST_NOW
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TEST_NOW);
});
afterEach(() => vi.useRealTimers());

async function get(role: "owner" | "front_desk" | "staff", query = "") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/dashboard/today${query}`, { headers: { cookie: `sid=${login.token}` } }));
}

const expected = {
  date: "2026-10-05",
  groom: { total: 4, byStatus: { scheduled: 1, checked_in: 0, in_progress: 0, done: 1, picked_up: 2, no_show: 0 } },
  hotel: { arrivals: 1, departures: 1, inHouse: 1, occupancyPercent: 33 },
  daycare: { count: 1 },
  sales: { paidTotalSatang: 70_000, billsClosed: 1 },
  todo: {
    pendingSlips: 1,
    pendingApprovals: 1,
    overdueCareTasks: 1,
    reportCardsToReview: 1,
    unsentMessages: 1,
    pickupsWithoutBill: 1,
    linkRequests: 1,
  },
};

it("counts today's branch figures for the owner, by the Bangkok local day and Q-0053 rules", async () => {
  expect(await dashboardToday(staffCtx(env.base, "owner"), {})).toEqual(expected);
  const response = await get("owner");
  expect(response.status).toBe(200);
  expect(DashboardTodayResponse.parse(await response.json())).toEqual(expected);
});

it("leaves sales out for front_desk", async () => {
  const response = await get("front_desk");
  expect(response.status).toBe(200);
  const body = DashboardTodayResponse.parse(await response.json());
  expect(body).not.toHaveProperty("sales");
  const { sales: _sales, ...rest } = expected;
  expect(body).toEqual(rest);
});

it("reports zero occupancy when the branch has no active room unit", async () => {
  await env.db.update(roomUnit).set({ status: "maintenance" }).where(eq(roomUnit.organizationId, env.base.orgId));
  try {
    const result = await dashboardToday(staffCtx(env.base, "owner"), {});
    expect(result.hotel).toEqual({ arrivals: 1, departures: 1, inHouse: 1, occupancyPercent: 0 });
  } finally {
    await env.db.update(roomUnit).set({ status: "active" }).where(eq(roomUnit.organizationId, env.base.orgId));
    await env.db.update(roomUnit).set({ status: "maintenance" }).where(eq(roomUnit.code, "R4"));
  }
});

it("rejects unknown query parameters with VALIDATION_FAILED", async () => {
  const response = await get("owner", "?date=2026-10-01");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("forbids role staff", async () => {
  const response = await get("staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("answers NOT_FOUND when the session branch belongs to another organization", async () => {
  const foreignBranch = (await env.db.select().from(stay)).find((s) => s.organizationId !== env.base.orgId)?.branchId ?? "";
  await expect(dashboardToday({ ...staffCtx(env.base, "owner"), branchId: foreignBranch }, {})).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
