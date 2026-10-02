import {
  BookingsBalanceLinkParams,
  BookingsBalanceLinkRequest,
  BookingsBalanceLinkResponse,
} from "@app/contracts/endpoints/bookings.balanceLink";
import { bill, booking, notification } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { bookingsBalanceLink } from "../../../src/services/bookings/balanceLink.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const POST = withStaff("bookings.balanceLink", { body: BookingsBalanceLinkRequest, params: BookingsBalanceLinkParams }, bookingsBalanceLink);
let env: TestEnv;
let foreign: SeedOrg;
let bookingId: string;
let billId: string;

async function seedBooking(org: SeedOrg, billStatus: "open" | "paid" | "void" | null) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [b] = billStatus
    ? await env.db
        .insert(bill)
        .values({
          ...tenant,
          customerId: org.customerId,
          status: billStatus,
          subtotalSatang: 150000,
          totalSatang: 150000,
          paidSatang: billStatus === "paid" ? 150000 : 50000,
          openedBy: org.staff.front_desk,
        })
        .returning()
    : [];
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: `B-${org.orgId.slice(0, 4)}-${Math.random()}`,
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      billId: b?.id ?? null,
    })
    .returning();
  if (!bk) throw new Error("seed: booking");
  return { bookingId: bk.id, billId: b?.id ?? "" };
}

beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  foreign = await otherOrg(env.db);
  ({ bookingId, billId } = await seedBooking(env.base, "open"));
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

async function post(body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk", id = bookingId) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/staff/bookings/${id}/balance-link`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ bookingId: id }) },
  );
}
const outbox = () => env.db.select().from(notification);

it("returns the LIFF pay URL of the open bill and its due amount without notifying by default", async () => {
  const response = await post({});
  expect(response.status).toBe(200);
  expect(BookingsBalanceLinkResponse.parse(await response.json())).toEqual({
    url: `https://petbooking.test/liff/shop-a/pay/${billId}`,
    amountSatang: 100000,
  });
  expect(await outbox()).toEqual([]);
});

it("enqueues customer.balance_link with the 07 dedupe key when send=true, once per amount", async () => {
  await bookingsBalanceLink(staffCtx(env.base, "owner"), { bookingId, send: true });
  await bookingsBalanceLink(staffCtx(env.base, "owner"), { bookingId, send: true });
  expect(await outbox()).toEqual([
    expect.objectContaining({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      recipientType: "customer",
      recipientId: env.base.customerId,
      templateKey: "customer.balance_link",
      payload: { amount: "฿1,000.00", payUrl: `https://petbooking.test/liff/shop-a/pay/${billId}` },
      dedupeKey: `balance_link:${billId}:100000:${env.base.customerId}`,
      monthKey: "2026-10",
      status: "queued",
    }),
  ]);
  await env.db.update(bill).set({ paidSatang: 120000 }).where(eq(bill.id, billId));
  await bookingsBalanceLink(staffCtx(env.base, "owner"), { bookingId, send: true });
  expect((await outbox()).map((n) => n.dedupeKey)).toContain(`balance_link:${billId}:30000:${env.base.customerId}`);
});

it("returns BILL_NOT_OPEN when the booking has no bill or the bill is paid/void", async () => {
  for (const status of [null, "paid", "void"] as const) {
    const seeded = await seedBooking(env.base, status);
    const response = await post({ send: true }, "owner", seeded.bookingId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "BILL_NOT_OPEN" } });
  }
  expect(await outbox()).toEqual([]);
});

it("rejects a malformed body or bookingId with VALIDATION_FAILED", async () => {
  expect(await (await post({ send: "yes" })).json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  const bad = await post({}, "owner", "not-a-uuid");
  expect(bad.status).toBe(422);
  expect(await bad.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("forbids role staff", async () => {
  const response = await post({ send: true }, "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("answers NOT_FOUND for another organization's booking", async () => {
  const theirs = await seedBooking(foreign, "open");
  const response = await post({ send: true }, "owner", theirs.bookingId);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  expect(await outbox()).toEqual([]);
});
