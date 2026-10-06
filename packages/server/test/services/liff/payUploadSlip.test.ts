// T-0181 liff.payUploadSlip: a customer's slip for their open bill → submitted bill slip + staff.slip_submitted.
import { LiffPayUploadSlipParams, LiffPayUploadSlipRequest, LiffPayUploadSlipResponse } from "@app/contracts/endpoints/liff.payUploadSlip";
import { bill, booking, branch, customer, fileObject, notification, paymentSlip } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { liffPayUploadSlip } from "../../../src/services/liff/payUploadSlip.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

/** R-05 vector 1 (KBank-style slip QR) */
const SLIP_QR = "0041000600000101030040220014242082547BPM049885102TH910434DF";
const TRANS_REF = "014242082547BPM04988";

let env: TestEnv;
const storage = createFakeStorage();
const POST = withCustomer("liff.payUploadSlip", { params: LiffPayUploadSlipParams, body: LiffPayUploadSlipRequest }, liffPayUploadSlip);
const call = async (slug: string, s: SeedOrg, billId: string, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/pay/${billId}/slips`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `cid=${encodeURIComponent(token)}` },
      body: JSON.stringify(body),
    }),
    { params: { branchSlug: slug, billId } },
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

async function shop(label: string) {
  const s = await seedOrg(env.db, label);
  await env.db
    .update(branch)
    .set({ promptpayType: "phone", promptpayId: "0812345678", promptpayAccountName: "ร้าน" })
    .where(eq(branch.id, s.branchId));
  return s;
}
async function openBill(s: SeedOrg, extra: Partial<typeof bill.$inferInsert> = {}) {
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: s.orgId,
      branchId: s.branchId,
      customerId: s.customerId,
      openedBy: s.staff.owner,
      subtotalSatang: 120000,
      totalSatang: 120000,
      paidSatang: 20000,
      ...extra,
    })
    .returning();
  if (!b) throw new Error("bill fixture");
  return b;
}
async function slipFile(s: SeedOrg, key: string) {
  const [f] = await env.db
    .insert(fileObject)
    .values({ organizationId: s.orgId, kind: "slip", storageKey: key, mimeType: "image/jpeg", sizeBytes: 10, uploadedByType: "customer" })
    .returning();
  if (!f) throw new Error("file fixture");
  storage.put(key, { sizeBytes: 10, contentType: "image/jpeg" });
  return f;
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

it("records a submitted bill slip with the R-05 reference, notifies front desk + owner, returns the bill's PaymentInstruction", async () => {
  const s = await shop("ps1");
  const b = await openBill(s);
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: s.orgId,
      branchId: s.branchId,
      customerId: s.customerId,
      bookingNo: "B2610-0007",
      billId: b.id,
      channel: "line_liff",
      createdByType: "customer",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  if (!bk) throw new Error("booking fixture");
  const f = await slipFile(s, "slip-ps1.jpg");

  const res = await call("shop-ps1", s, b.id, { fileId: f.id, qrPayload: SLIP_QR });
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffPayUploadSlipResponse;
  expect(LiffPayUploadSlipResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({ amountSatang: 100000, accountName: "ร้าน", promptpayIdMasked: "678", expiresAt: null });

  const [slip] = await env.db.select().from(paymentSlip).where(eq(paymentSlip.billId, b.id));
  expect(slip).toMatchObject({
    organizationId: s.orgId,
    branchId: s.branchId,
    bookingId: null,
    fileId: f.id,
    uploadedByType: "customer",
    amountExpectedSatang: 100000,
    qrPayload: SLIP_QR,
    transRef: TRANS_REF,
    duplicateOfSlipId: null,
    status: "submitted",
  });
  const [file] = await env.db.select().from(fileObject).where(eq(fileObject.id, f.id));
  expect(file?.committedAt).not.toBeNull();
  const sent = await env.db.select().from(notification).where(eq(notification.templateKey, "staff.slip_submitted"));
  const mine = sent.filter((n) => n.organizationId === s.orgId);
  expect(mine.map((n) => n.recipientId).sort()).toEqual([s.staff.front_desk, s.staff.owner].sort());
  expect(mine[0]).toMatchObject({
    dedupeKey: `slip_submitted:${slip?.id}:${mine[0]?.recipientId}`,
    payload: { bookingNo: "B2610-0007", amount: "฿1,000", duplicateFlag: "" },
  });
});

it("a second slip with the same reference is kept as a duplicate and flagged; no QR → no reference", async () => {
  const s = await shop("ps2");
  const b = await openBill(s);
  const first = await call("shop-ps2", s, b.id, { fileId: (await slipFile(s, "a-ps2.jpg")).id, qrPayload: SLIP_QR });
  expect(first.status).toBe(200);
  expect((await call("shop-ps2", s, b.id, { fileId: (await slipFile(s, "b-ps2.jpg")).id, qrPayload: SLIP_QR })).status).toBe(200);
  expect((await call("shop-ps2", s, b.id, { fileId: (await slipFile(s, "c-ps2.jpg")).id })).status).toBe(200);
  const slips = await env.db.select().from(paymentSlip).where(eq(paymentSlip.billId, b.id));
  const original = slips.find((x) => x.transRef && !x.duplicateOfSlipId);
  const dup = slips.find((x) => x.duplicateOfSlipId);
  expect(dup?.duplicateOfSlipId).toBe(original?.id);
  expect(slips.filter((x) => x.transRef === null)).toHaveLength(1);
  const flagged = await env.db
    .select()
    .from(notification)
    .where(eq(notification.dedupeKey, `slip_submitted:${dup?.id}:${s.staff.owner}`));
  expect(flagged[0]?.payload).toMatchObject({ duplicateFlag: "⚠️ สลิปนี้เคยใช้แล้ว" });
});

it("invalid body → VALIDATION_FAILED; a non-slip file → VALIDATION_FAILED", async () => {
  const s = await shop("ps3");
  const b = await openBill(s);
  const f = await slipFile(s, "ps3.jpg");
  for (const body of [{}, { fileId: "x" }, { fileId: f.id, amountSatang: 1 }])
    expect(await errorCode(await call("shop-ps3", s, b.id, body))).toBe("VALIDATION_FAILED");
  expect(await errorCode(await call("shop-ps3", s, "not-a-uuid", { fileId: f.id }))).toBe("VALIDATION_FAILED");
  const [logo] = await env.db
    .insert(fileObject)
    .values({
      organizationId: s.orgId,
      kind: "logo",
      storageKey: "logo-ps3.png",
      mimeType: "image/png",
      sizeBytes: 10,
      uploadedByType: "staff",
    })
    .returning();
  expect(await errorCode(await call("shop-ps3", s, b.id, { fileId: logo?.id }))).toBe("VALIDATION_FAILED");
});

it("another customer's bill, another shop's bill, an unknown bill → NOT_FOUND; a paid bill → BILL_NOT_OPEN; no PromptPay → PROMPTPAY_NOT_CONFIGURED", async () => {
  const s = await shop("ps4");
  const other = await shop("ps5");
  const f = await slipFile(s, "ps4.jpg");
  const [someone] = await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: other.ownerProfileId }).returning();
  const notMine = await openBill(s, { customerId: someone?.id });
  const otherShop = await openBill(other);
  for (const id of [notMine.id, otherShop.id, crypto.randomUUID()])
    expect(await errorCode(await call("shop-ps4", s, id, { fileId: f.id }))).toBe("NOT_FOUND");
  const paid = await openBill(s, { status: "paid", paidSatang: 120000 });
  expect(await errorCode(await call("shop-ps4", s, paid.id, { fileId: f.id }))).toBe("BILL_NOT_OPEN");
  await env.db.update(branch).set({ promptpayType: null, promptpayId: null }).where(eq(branch.id, s.branchId));
  expect(await errorCode(await call("shop-ps4", s, (await openBill(s)).id, { fileId: f.id }))).toBe("PROMPTPAY_NOT_CONFIGURED");
  expect(await env.db.select().from(paymentSlip).where(eq(paymentSlip.organizationId, s.orgId))).toEqual([]);
});
