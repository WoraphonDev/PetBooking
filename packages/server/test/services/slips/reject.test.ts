import { SlipsRejectParams, SlipsRejectRequest, SlipsRejectResponse } from "@app/contracts/endpoints/slips.reject";
import {
  auditLog,
  booking,
  bookingEvent,
  fileObject,
  groomAppointment,
  groomStation,
  notification,
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
import { slipsReject } from "../../../src/services/slips/reject.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("slips.reject", { body: SlipsRejectRequest, params: SlipsRejectParams }, slipsReject);
let env: TestEnv;
let other: SeedOrg;
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

let seq = 0;
/** a booking in deposit_review with one appointment and a submitted slip (+ earlier rejected ones) */
async function seedSlip(
  opts: { bookingStatus?: typeof booking.$inferInsert.status; rejectedBefore?: number } = {},
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
      status: opts.bookingStatus ?? "deposit_review",
      depositStatus: "submitted",
      depositRequiredSatang: 30_000,
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
  const startsAt = new Date(Date.now() + 72 * 3_600_000 + seq * 86_400_000);
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
  const slip = async (status: "submitted" | "rejected") => {
    const key = `org/${org.orgId}/slip/2026/10/s${++seq}.jpg`;
    const [f] = await env.db
      .insert(fileObject)
      .values({
        organizationId: org.orgId,
        kind: "slip",
        storageKey: key,
        mimeType: "image/jpeg",
        sizeBytes: 10,
        uploadedByType: "customer",
        committedAt: new Date(),
      })
      .returning();
    const [s] = await env.db
      .insert(paymentSlip)
      .values({
        ...tenant,
        bookingId: bk?.id,
        fileId: f?.id ?? "",
        uploadedByType: "customer",
        amountExpectedSatang: 30_000,
        transRef: `TX${seq}`,
        status,
        createdAt: new Date(Date.now() - 1_000 + seq),
      })
      .returning();
    return { id: s?.id ?? "", key };
  };
  for (let i = 0; i < (opts.rejectedBefore ?? 0); i++) await slip("rejected");
  const s = await slip("submitted");
  return { bookingId: bk?.id ?? "", apptId: a?.id ?? "", slipId: s.id, key: s.key, bookingNo: bk?.bookingNo ?? "" };
}
async function call(
  path: string,
  method: string,
  params: Record<string, string>,
  body?: unknown,
  role: "owner" | "front_desk" | "staff" = "front_desk",
) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/slips${path}`, {
      method,
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const reject = (slipId: string, body: unknown = { reason: "ยอดโอนไม่ตรง" }, role?: "owner" | "front_desk" | "staff") =>
  call(`/${slipId}/reject`, "POST", { slipId }, body, role);
const bookingRow = async (id: string) => (await env.db.select().from(booking).where(eq(booking.id, id)))[0];

it("first rejection: slip rejected, deposit rejected, booking back to awaiting_deposit with a new hold + job, slip_rejected", async () => {
  const s = await seedSlip();
  const res = await reject(s.slipId);
  expect(res.status).toBe(200);
  const item = SlipsRejectResponse.parse(await res.json());
  expect(item).toMatchObject({ id: s.slipId, status: "rejected", rejectReason: "ยอดโอนไม่ตรง" });
  expect(item.reviewedAt).not.toBeNull();
  const [slip] = await env.db.select().from(paymentSlip).where(eq(paymentSlip.id, s.slipId));
  expect(slip).toMatchObject({ status: "rejected", reviewedBy: env.base.staff.front_desk });
  const bk = await bookingRow(s.bookingId);
  expect(bk).toMatchObject({ status: "awaiting_deposit", depositStatus: "rejected" });
  expect(bk?.holdExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  expect(item.holdExpiresAt).toBe(bk?.holdExpiresAt?.toISOString());
  const [job] = await env.db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.dedupeKey, `expire_hold:${s.bookingId}:${bk?.holdExpiresAt?.toISOString()}`));
  expect(job).toMatchObject({ jobType: "expire_hold", status: "pending", payload: { bookingId: s.bookingId } });
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, s.slipId));
  expect(audit).toMatchObject({ action: "slip.reject", reason: "ยอดโอนไม่ตรง" });
  const [note] = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `slip_rejected:${s.slipId}:${env.base.customerId}`));
  expect(note?.payload).toMatchObject({
    bookingNo: s.bookingNo,
    reason: "ยอดโอนไม่ตรง",
    payUrl: `https://petbooking.test/liff/shop-a/bookings/${s.bookingId}/pay`,
  });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, s.bookingId));
  expect(events.map((e) => [e.entityType, e.toStatus]).sort()).toEqual(
    [
      ["booking", "awaiting_deposit"],
      ["deposit", "rejected"],
    ].sort(),
  );
});

it("second rejection: booking expired, appointment cancelled, hold_expired instead of slip_rejected (Q-0102)", async () => {
  const s = await seedSlip({ rejectedBefore: 1 });
  expect((await reject(s.slipId)).status).toBe(200);
  expect(await bookingRow(s.bookingId)).toMatchObject({ status: "expired", holdExpiresAt: null });
  expect((await env.db.select().from(groomAppointment).where(eq(groomAppointment.id, s.apptId)))[0]?.status).toBe("cancelled");
  const keys = (await env.db.select().from(notification)).map((n) => n.dedupeKey);
  expect(keys).toContain(`hold_expired:${s.bookingId}:${env.base.customerId}`);
  expect(keys).not.toContain(`slip_rejected:${s.slipId}:${env.base.customerId}`);
});

it("an already reviewed slip → INVALID_TRANSITION", async () => {
  const s = await seedSlip();
  await reject(s.slipId);
  expect(await codeOf(await reject(s.slipId))).toBe("INVALID_TRANSITION");
});

it("reason < 3 → VALIDATION_FAILED; role staff → FORBIDDEN; another org → NOT_FOUND", async () => {
  const s = await seedSlip();
  expect(await codeOf(await reject(s.slipId, { reason: "no" }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await reject(s.slipId, undefined, "staff"))).toBe("FORBIDDEN");
  expect(await codeOf(await reject((await seedSlip({}, other)).slipId))).toBe("NOT_FOUND");
  expect((await env.db.select().from(paymentSlip).where(eq(paymentSlip.id, s.slipId)))[0]?.status).toBe("submitted");
});
