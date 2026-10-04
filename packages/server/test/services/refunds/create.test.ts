import { RefundsCreateRequest, RefundsCreateResponse } from "@app/contracts/endpoints/refunds.create";
import { auditLog, bill, booking, bookingEvent, creditLedger, customer, fileObject, refund } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { refundsCreate } from "../../../src/services/refunds/create.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;
const POST = withStaff("refunds.create", { body: RefundsCreateRequest }, refundsCreate);
beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  storage = createFakeStorage();
  setStorage(storage);
  // credit_ledger / audit_log are append-only; reset only the balance
  await env.db.update(customer).set({ creditBalanceSatang: 0 }).where(eq(customer.id, env.base.customerId));
  resetRateLimits();
});

async function seedBooking(depositStatus: typeof booking.$inferInsert.depositStatus, org: SeedOrg = env.base) {
  const [row] = await env.db
    .insert(booking)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      customerId: org.customerId,
      channel: "walk_in",
      bookingNo: `B6910-${String(++seq).padStart(4, "0")}`,
      createdByType: "staff",
      policySnapshot: {},
      status: "cancelled",
      depositStatus,
      depositRequiredSatang: 30_000,
      depositVerifiedSatang: depositStatus === "verified" ? 30_000 : 0,
    })
    .returning();
  return row?.id ?? "";
}
async function seedBill(org: SeedOrg = env.base) {
  const [row] = await env.db
    .insert(bill)
    .values({ organizationId: org.orgId, branchId: org.branchId, customerId: org.customerId, openedBy: org.staff.owner })
    .returning();
  return row?.id ?? "";
}
async function post(input: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/refunds", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const base = (over: Record<string, unknown> = {}) => ({
  customerId: env.base.customerId,
  amountSatang: 30_000,
  mode: "bank_transfer",
  reason: "ยกเลิกล่วงหน้า",
  ...over,
});

it("records a bank-transfer refund for a booking, moves the verified deposit to refunded and audits it", async () => {
  const bookingId = await seedBooking("verified");
  const res = await post(base({ bookingId }));
  expect(res.status).toBe(200);
  const body = RefundsCreateResponse.parse(await res.json());
  const [row] = await env.db.select().from(refund).where(eq(refund.id, body.id));
  expect(row).toMatchObject({
    bookingId,
    billId: null,
    customerId: env.base.customerId,
    amountSatang: 30_000,
    mode: "bank_transfer",
    reason: "ยกเลิกล่วงหน้า",
    proofFileId: null,
    createdBy: env.base.staff.front_desk,
  });
  expect(body).toMatchObject({ id: row?.id, bookingId, createdBy: env.base.staff.front_desk, createdAt: row?.createdAt.toISOString() });
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, bookingId));
  expect(bk?.depositStatus).toBe("refunded");
  const events = await env.db.select().from(bookingEvent).where(eq(bookingEvent.bookingId, bookingId));
  expect(events.map((e) => [e.entityType, e.fromStatus, e.toStatus, e.reason])).toEqual([
    ["deposit", "verified", "refunded", "ยกเลิกล่วงหน้า"],
  ]);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, body.id));
  expect(audit).toMatchObject({
    action: "refund.create",
    entityType: "refund",
    reason: "ยกเลิกล่วงหน้า",
    after: { amountSatang: 30_000, mode: "bank_transfer", bookingId, billId: null },
  });
  expect(await env.db.select().from(creditLedger).where(eq(creditLedger.refId, body.id))).toEqual([]);
});

it("mode credit writes credit_ledger cancellation_credit, raises the balance and marks the deposit credited", async () => {
  const bookingId = await seedBooking("verified");
  const body = RefundsCreateResponse.parse(await (await post(base({ bookingId, mode: "credit", amountSatang: 12_500 }))).json());
  const [entry] = await env.db.select().from(creditLedger).where(eq(creditLedger.refId, body.id));
  expect(entry).toMatchObject({
    customerId: env.base.customerId,
    deltaSatang: 12_500,
    reason: "cancellation_credit",
    refType: "refund",
    createdBy: env.base.staff.front_desk,
  });
  const [c] = await env.db.select().from(customer).where(eq(customer.id, env.base.customerId));
  expect(c?.creditBalanceSatang).toBe(12_500);
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, bookingId));
  expect(bk?.depositStatus).toBe("credited");
});

it.each(["forfeited", "refunded", "pending"] as const)("a %s deposit is left as it is (Q-0094)", async (status) => {
  const bookingId = await seedBooking(status);
  expect((await post(base({ bookingId }))).status).toBe(200);
  const [bk] = await env.db.select().from(booking).where(eq(booking.id, bookingId));
  expect(bk?.depositStatus).toBe(status);
});

it("records a cash refund against a bill without a booking", async () => {
  const billId = await seedBill();
  const body = RefundsCreateResponse.parse(await (await post(base({ billId, mode: "cash" }))).json());
  expect(body).toMatchObject({ billId, bookingId: null, mode: "cash" });
});

it("commits an uploaded proof file and refuses one that was never uploaded", async () => {
  const [file] = await env.db
    .insert(fileObject)
    .values({
      organizationId: env.base.orgId,
      kind: "proof",
      storageKey: `org/${env.base.orgId}/proof/2026/10/x${++seq}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      uploadedByType: "staff",
    })
    .returning();
  expect(await codeOf(await post(base({ proofFileId: file?.id })))).toBe("FILE_NOT_UPLOADED");
  expect(
    await env.db
      .select()
      .from(refund)
      .where(eq(refund.proofFileId, file?.id ?? "")),
  ).toEqual([]);
  storage.put(file?.storageKey ?? "", { sizeBytes: 1000, contentType: "image/jpeg" });
  const body = RefundsCreateResponse.parse(await (await post(base({ proofFileId: file?.id }))).json());
  expect(body.proofFileId).toBe(file?.id);
  const [committed] = await env.db
    .select()
    .from(fileObject)
    .where(eq(fileObject.id, file?.id ?? ""));
  expect(committed?.committedAt).not.toBeNull();
});

it.each([
  ["amount 0", { amountSatang: 0 }],
  ["amount negative", { amountSatang: -100 }],
  ["reason too short", { reason: "ab" }],
  ["missing mode", { mode: undefined }],
  ["unknown mode", { mode: "cheque" }],
  ["missing customer", { customerId: undefined }],
])("VALIDATION_FAILED: %s", async (_name, over) => {
  expect(await codeOf(await post(base(over)))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN", async () => {
  expect(await codeOf(await post(base(), "staff"))).toBe("FORBIDDEN");
});

it("another org's customer, booking or bill → NOT_FOUND, and nothing is written", async () => {
  const before = (await env.db.select().from(refund)).length;
  expect(await codeOf(await post(base({ customerId: other.customerId })))).toBe("NOT_FOUND");
  expect(await codeOf(await post(base({ bookingId: await seedBooking("verified", other) })))).toBe("NOT_FOUND");
  expect(await codeOf(await post(base({ billId: await seedBill(other) })))).toBe("NOT_FOUND");
  expect((await env.db.select().from(refund)).length).toBe(before);
});
