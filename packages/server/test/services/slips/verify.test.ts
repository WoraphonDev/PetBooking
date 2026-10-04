import { SlipsVerifyParams, SlipsVerifyRequest, SlipsVerifyResponse } from "@app/contracts/endpoints/slips.verify";
import {
  auditLog,
  bill,
  booking,
  bookingEvent,
  fileObject,
  groomAppointment,
  groomStation,
  notification,
  payment,
  paymentSlip,
  pet,
  scheduledJob,
  staffUser,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { slipsVerify } from "../../../src/services/slips/verify.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("slips.verify", { body: SlipsVerifyRequest, params: SlipsVerifyParams }, slipsVerify);
let env: TestEnv;
let other: SeedOrg;
let seq = 0;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  setStorage(createFakeStorage());
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function slipFile(org: SeedOrg) {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind: "slip",
      storageKey: `org/${org.orgId}/slip/2026/10/s${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 10,
      uploadedByType: "customer",
      committedAt: new Date(),
    })
    .returning();
  return f?.id ?? "";
}
/** a deposit_review booking (deposit 300 บาท submitted) with one appointment 3 days ahead and its submitted slip */
async function seedSlip(
  opts: { approvalDueAt?: Date; status?: typeof paymentSlip.$inferInsert.status; duplicate?: boolean } = {},
  org: SeedOrg = env.base,
) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
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
      status: "deposit_review",
      depositStatus: "submitted",
      depositRequiredSatang: 30_000,
      approvalDueAt: opts.approvalDueAt ?? null,
      policySnapshot: {},
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
  const startsAt = new Date(Date.now() + 72 * 3_600_000 + seq * 60_000);
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
  let duplicateOf: string | null = null;
  if (opts.duplicate) {
    const [first] = await env.db
      .insert(paymentSlip)
      .values({
        ...tenant,
        bookingId: bk?.id,
        fileId: await slipFile(org),
        uploadedByType: "customer",
        amountExpectedSatang: 30_000,
        transRef: `TX${seq}`,
        status: "verified",
      })
      .returning();
    duplicateOf = first?.id ?? null;
  }
  const [s] = await env.db
    .insert(paymentSlip)
    .values({
      ...tenant,
      bookingId: bk?.id,
      fileId: await slipFile(org),
      uploadedByType: "customer",
      amountExpectedSatang: 30_000,
      transRef: `TX${seq}`,
      status: opts.status ?? "submitted",
      duplicateOfSlipId: duplicateOf,
    })
    .returning();
  return { slipId: s?.id ?? "", bookingId: bk?.id ?? "", apptId: a?.id ?? "", bookingNo: bk?.bookingNo ?? "" };
}
async function verify(slipId: string, body: unknown = { amountSatang: 30_000 }, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/slips/${slipId}/verify`, {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: { slipId } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];
const keys = async () => (await env.db.select().from(notification)).map((n) => n.dedupeKey);

it("verifies a deposit slip: promptpay payment, deposit verified, booking confirmed with reminder + messages, audit", async () => {
  const s = await seedSlip();
  const res = await verify(s.slipId);
  expect(res.status).toBe(200);
  const item = SlipsVerifyResponse.parse(await res.json());
  expect(item).toMatchObject({ id: s.slipId, status: "verified" });
  expect(item.reviewedAt).not.toBeNull();
  const [p] = await env.db.select().from(payment).where(eq(payment.slipId, s.slipId));
  expect(p).toMatchObject({ bookingId: s.bookingId, method: "promptpay", amountSatang: 30_000, receivedBy: env.base.staff.front_desk });
  expect(await bookingRow(s.bookingId)).toMatchObject({ status: "confirmed", depositStatus: "verified", depositVerifiedSatang: 30_000 });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, s.bookingId));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus]).sort()).toEqual(
    [
      ["booking", "deposit_review", "confirmed"],
      ["deposit", "submitted", "verified"],
    ].sort(),
  );
  const jobs = (await env.db.select().from(scheduledJob)).filter((j) => j.dedupeKey.startsWith(`reminder_24h:${s.apptId}:`));
  expect(jobs).toHaveLength(1);
  expect(await keys()).toEqual(
    expect.arrayContaining([
      `deposit_confirmed:${s.bookingId}:${env.base.customerId}`,
      `booking_confirmed:${s.bookingId}:${env.base.customerId}`,
    ]),
  );
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, s.slipId));
  expect(audit).toMatchObject({ action: "slip.verify", after: { status: "verified", amountSatang: 30_000, paymentId: p?.id } });
});

it("a booking that needs approval waits in awaiting_approval, or is approved at once with approveBooking", async () => {
  const waiting = await seedSlip({ approvalDueAt: new Date(Date.now() + 3_600_000) });
  expect((await verify(waiting.slipId)).status).toBe(200);
  expect((await bookingRow(waiting.bookingId))?.status).toBe("awaiting_approval");
  expect(await keys()).not.toContain(`booking_confirmed:${waiting.bookingId}:${env.base.customerId}`);
  const now = await seedSlip({ approvalDueAt: new Date(Date.now() + 3_600_000) });
  await env.db.insert(scheduledJob).values({
    organizationId: env.base.orgId,
    jobType: "approval_overdue",
    runAt: new Date(Date.now() + 3_600_000),
    payload: { bookingId: now.bookingId, n: 1 },
    dedupeKey: `approval_overdue:${now.bookingId}:1`,
  });
  expect((await verify(now.slipId, { amountSatang: 30_000, approveBooking: true })).status).toBe(200);
  expect((await bookingRow(now.bookingId))?.status).toBe("confirmed");
  const [job] = await env.db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.dedupeKey, `approval_overdue:${now.bookingId}:1`));
  expect(job?.status).toBe("cancelled");
});

it("a short amount is still verified and counts what arrived", async () => {
  const s = await seedSlip();
  await verify(s.slipId, { amountSatang: 20_000 });
  expect(await bookingRow(s.bookingId)).toMatchObject({ depositStatus: "verified", depositVerifiedSatang: 20_000 });
});

it("a duplicate slip needs confirmDuplicate", async () => {
  const s = await seedSlip({ duplicate: true });
  expect(await codeOf(await verify(s.slipId))).toBe("DUPLICATE_SLIP_CONFIRM_REQUIRED");
  expect((await verify(s.slipId, { amountSatang: 30_000, confirmDuplicate: true })).status).toBe(200);
});

it("a bill slip pays the open bill instead", async () => {
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [b] = await env.db
    .insert(bill)
    .values({
      ...tenant,
      customerId: env.base.customerId,
      openedBy: env.base.staff.owner,
      subtotalSatang: 50_000,
      totalSatang: 50_000,
      paidSatang: 10_000,
    })
    .returning();
  const [s] = await env.db
    .insert(paymentSlip)
    .values({
      ...tenant,
      billId: b?.id,
      fileId: await slipFile(env.base),
      uploadedByType: "customer",
      amountExpectedSatang: 40_000,
      status: "submitted",
    })
    .returning();
  expect((await verify(s?.id ?? "", { amountSatang: 40_000 })).status).toBe(200);
  const [p] = await env.db
    .select()
    .from(payment)
    .where(eq(payment.slipId, s?.id ?? ""));
  expect(p).toMatchObject({ billId: b?.id, bookingId: null, method: "promptpay", amountSatang: 40_000 });
  expect(
    (
      await env.db
        .select()
        .from(bill)
        .where(eq(bill.id, b?.id ?? ""))
    )[0]?.paidSatang,
  ).toBe(50_000);
});

it("an already reviewed slip → STATUS_NOT_ALLOWED", async () => {
  expect(await codeOf(await verify((await seedSlip({ status: "rejected" })).slipId))).toBe("STATUS_NOT_ALLOWED");
});

it("amount 0 → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const s = await seedSlip();
  expect(await codeOf(await verify(s.slipId, { amountSatang: 0 }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await verify(s.slipId, undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await verify((await seedSlip({}, other)).slipId))).toBe("NOT_FOUND");
  expect((await bookingRow(s.bookingId))?.depositStatus).toBe("submitted");
});
