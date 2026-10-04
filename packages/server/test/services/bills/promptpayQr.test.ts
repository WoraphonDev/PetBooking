import { BillsPromptpayQrParams, BillsPromptpayQrResponse } from "@app/contracts/endpoints/bills.promptpayQr";
import { bill, branch } from "@app/db/schema";
import { promptPayPayload } from "@app/domain/payment/promptpay";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { billsPromptpayQr } from "../../../src/services/bills/promptpayQr.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("bills.promptpayQr", { params: BillsPromptpayQrParams }, billsPromptpayQr);
let env: TestEnv;
let other: SeedOrg;
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db
    .update(branch)
    .set({ promptpayType: "phone", promptpayId: "081-234-5678", promptpayAccountName: "ร้านน้องหมา" })
    .where(eq(branch.id, env.base.branchId));
});

async function seedBill(values: Partial<typeof bill.$inferInsert> = {}, org: SeedOrg = env.base) {
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      openedBy: org.staff.owner,
      subtotalSatang: 120_050,
      totalSatang: 120_050,
      ...values,
    })
    .returning();
  return b?.id ?? "";
}
async function get(billId: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/staff/bills/${billId}/promptpay-qr`, { headers: { cookie: `sid=${login.token}` } }),
    {
      params: { billId },
    },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("returns the R-30 payload for the amount still due, with the account name and masked id", async () => {
  const billId = await seedBill({ paidSatang: 20_000 });
  const res = await get(billId);
  expect(res.status).toBe(200);
  const body = BillsPromptpayQrResponse.parse(await res.json());
  const expected = promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 100_050 });
  expect(body).toEqual({
    amountSatang: 100_050,
    promptpayPayload: "payload" in expected ? expected.payload : "",
    accountName: "ร้านน้องหมา",
    promptpayIdMasked: "678",
    expiresAt: null,
  });
  expect(body.promptpayPayload).toContain("54071000.50");
});

it("a fully paid bill gets a QR without an amount", async () => {
  const billId = await seedBill({ paidSatang: 120_050 });
  const body = BillsPromptpayQrResponse.parse(await (await get(billId)).json());
  expect(body.amountSatang).toBe(0);
  expect(body.promptpayPayload.startsWith("000201010211")).toBe(true);
});

it("PROMPTPAY_NOT_CONFIGURED without a PromptPay account or with an id R-30 rejects", async () => {
  const billId = await seedBill();
  await env.db.update(branch).set({ promptpayType: null, promptpayId: null }).where(eq(branch.id, env.base.branchId));
  expect(await codeOf(await get(billId))).toBe("PROMPTPAY_NOT_CONFIGURED");
  await env.db.update(branch).set({ promptpayType: "phone", promptpayId: "12345" }).where(eq(branch.id, env.base.branchId));
  expect(await codeOf(await get(billId))).toBe("PROMPTPAY_NOT_CONFIGURED");
});

it("malformed id → VALIDATION_FAILED", async () => {
  expect(await codeOf(await get("bill-1"))).toBe("VALIDATION_FAILED");
});

it("role staff → FORBIDDEN", async () => {
  expect(await codeOf(await get(await seedBill(), "staff"))).toBe("FORBIDDEN");
});

it("another org's bill → NOT_FOUND", async () => {
  expect(await codeOf(await get(await seedBill({}, other)))).toBe("NOT_FOUND");
});
