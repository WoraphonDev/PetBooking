// T-0178 liff.uploadSlip: a deposit slip for the customer's held booking → deposit_review + staff.slip_submitted.
import { LiffUploadSlipParams, LiffUploadSlipRequest, LiffUploadSlipResponse } from "@app/contracts/endpoints/liff.uploadSlip";
import {
  booking,
  bookingEvent,
  customer,
  daycareSessionType,
  daycareVisit,
  fileObject,
  notification,
  paymentSlip,
  pet,
} from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { liffUploadSlip } from "../../../src/services/liff/uploadSlip.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

/** R-05 vector 1 (KBank-style slip QR) */
const SLIP_QR = "0041000600000101030040220014242082547BPM049885102TH910434DF";
const TRANS_REF = "014242082547BPM04988";

let env: TestEnv;
const storage = createFakeStorage();
const POST = withCustomer("liff.uploadSlip", { params: LiffUploadSlipParams, body: LiffUploadSlipRequest }, liffUploadSlip);
const call = async (slug: string, s: SeedOrg, bookingId: string, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/bookings/${bookingId}/slips`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug, bookingId } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

async function held(s: SeedOrg, extra: Partial<typeof booking.$inferInsert> = {}, customerId = s.customerId) {
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: s.orgId,
      branchId: s.branchId,
      customerId,
      bookingNo: `B-${crypto.randomUUID().slice(0, 8)}`,
      channel: "line_liff",
      createdByType: "customer",
      status: "awaiting_deposit",
      depositRequiredSatang: 30_000,
      depositVerifiedSatang: 0,
      depositStatus: "pending",
      holdExpiresAt: inHours(1),
      firstServiceAt: inHours(48),
      policySnapshot: {},
      ...extra,
    })
    .returning();
  if (!bk) throw new Error("booking fixture");
  // a booking always has a service line (R-07 needs its modules for the cancel preview)
  const tenant = { organizationId: s.orgId, branchId: s.branchId };
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: s.ownerProfileId, createdInOrgId: s.orgId, name: "โมจิ", species: "dog" })
    .returning();
  const [found] = await env.db.select().from(daycareSessionType).where(eq(daycareSessionType.branchId, s.branchId));
  const [session] = found
    ? [found]
    : await env.db
        .insert(daycareSessionType)
        .values({ ...tenant, session: "full_day", nameTh: "เต็มวัน", startsAt: "08:00", endsAt: "18:00", capacity: 10 })
        .returning();
  await env.db.insert(daycareVisit).values({
    ...tenant,
    bookingId: bk.id,
    petId: p?.id ?? "",
    sessionTypeId: session?.id ?? "",
    visitDate: "2026-12-05",
    priceSatang: 30_000,
  });
  return bk;
}
async function slipFile(s: SeedOrg) {
  const key = `slip-${crypto.randomUUID()}.jpg`;
  const [f] = await env.db
    .insert(fileObject)
    .values({ organizationId: s.orgId, kind: "slip", storageKey: key, mimeType: "image/jpeg", sizeBytes: 10, uploadedByType: "customer" })
    .returning();
  if (!f) throw new Error("file fixture");
  storage.put(key, { sizeBytes: 10, contentType: "image/jpeg" });
  return f.id;
}

beforeAll(async () => {
  env = await setupTestDb();
  setStorage(storage);
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  return () => vi.unstubAllEnvs();
});

it("records the slip, moves the booking to deposit_review / deposit submitted, clears the hold and notifies staff", async () => {
  const s = await seedOrg(env.db, "us1");
  const bk = await held(s);
  const fileId = await slipFile(s);
  const res = await call("shop-us1", s, bk.id, { fileId, qrPayload: SLIP_QR });
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffUploadSlipResponse;
  expect(LiffUploadSlipResponse.safeParse(body).success).toBe(true);
  expect(body.booking).toMatchObject({ id: bk.id, status: "deposit_review", depositStatus: "submitted" });
  const [row] = await env.db.select().from(booking).where(eq(booking.id, bk.id));
  expect(row).toMatchObject({ status: "deposit_review", depositStatus: "submitted", holdExpiresAt: null });
  const [slip] = await env.db.select().from(paymentSlip).where(eq(paymentSlip.bookingId, bk.id));
  expect(slip).toMatchObject({
    billId: null,
    fileId,
    uploadedByType: "customer",
    amountExpectedSatang: 30_000,
    qrPayload: SLIP_QR,
    transRef: TRANS_REF,
    duplicateOfSlipId: null,
    status: "submitted",
  });
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bk.id));
  expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual(
    expect.arrayContaining([
      ["awaiting_deposit", "deposit_review"],
      ["pending", "submitted"],
    ]),
  );
  const sent = (await env.db.select().from(notification).where(eq(notification.templateKey, "staff.slip_submitted"))).filter(
    (n) => n.organizationId === s.orgId,
  );
  expect(sent.map((n) => n.recipientId).sort()).toEqual([s.staff.front_desk, s.staff.owner].sort());
  expect(sent[0]).toMatchObject({
    dedupeKey: `slip_submitted:${slip?.id}:${sent[0]?.recipientId}`,
    payload: { bookingNo: bk.bookingNo, amount: "฿300", duplicateFlag: "" },
  });
});

it("a reused slip reference is kept and flagged as a duplicate", async () => {
  const s = await seedOrg(env.db, "us2");
  const first = await held(s);
  await call("shop-us2", s, first.id, { fileId: await slipFile(s), qrPayload: SLIP_QR });
  const second = await held(s);
  expect((await call("shop-us2", s, second.id, { fileId: await slipFile(s), qrPayload: SLIP_QR })).status).toBe(200);
  const [a] = await env.db.select().from(paymentSlip).where(eq(paymentSlip.bookingId, first.id));
  const [b] = await env.db.select().from(paymentSlip).where(eq(paymentSlip.bookingId, second.id));
  expect(b?.duplicateOfSlipId).toBe(a?.id);
});

it("a passed hold or an expired booking → HOLD_EXPIRED; another status → STATUS_NOT_ALLOWED; deposit not pending → INVALID_TRANSITION", async () => {
  const s = await seedOrg(env.db, "us3");
  const fileId = await slipFile(s);
  expect(await errorCode(await call("shop-us3", s, (await held(s, { holdExpiresAt: inHours(-1) })).id, { fileId }))).toBe("HOLD_EXPIRED");
  expect(await errorCode(await call("shop-us3", s, (await held(s, { status: "expired" })).id, { fileId }))).toBe("HOLD_EXPIRED");
  expect(await errorCode(await call("shop-us3", s, (await held(s, { status: "confirmed" })).id, { fileId }))).toBe("STATUS_NOT_ALLOWED");
  const odd = await held(s, { depositStatus: "verified" });
  expect(await errorCode(await call("shop-us3", s, odd.id, { fileId }))).toBe("INVALID_TRANSITION");
  const [row] = await env.db.select().from(booking).where(eq(booking.id, odd.id));
  expect(row?.status).toBe("awaiting_deposit");
});

it("invalid body → VALIDATION_FAILED; another customer's / shop's booking → NOT_FOUND", async () => {
  const s = await seedOrg(env.db, "us4");
  const t = await seedOrg(env.db, "us5");
  const bk = await held(s);
  for (const body of [{}, { fileId: "x" }, { fileId: crypto.randomUUID(), status: "x" }])
    expect(await errorCode(await call("shop-us4", s, bk.id, body))).toBe("VALIDATION_FAILED");
  const [someone] = await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: t.ownerProfileId }).returning();
  const fileId = await slipFile(s);
  for (const id of [(await held(s, {}, someone?.id)).id, (await held(t)).id, crypto.randomUUID()])
    expect(await errorCode(await call("shop-us4", s, id, { fileId }))).toBe("NOT_FOUND");
});
