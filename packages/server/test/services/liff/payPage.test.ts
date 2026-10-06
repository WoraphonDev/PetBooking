// T-0178 liff.payPage: the PaymentInstruction for the customer's open bill (L-14).
import { LiffPayPageParams, LiffPayPageResponse } from "@app/contracts/endpoints/liff.payPage";
import { bill, branch, customer } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withCustomer } from "../../../src/http/wrap.ts";
import { liffPayPage } from "../../../src/services/liff/payPage.ts";
import { type SeedOrg, seedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const GET = withCustomer("liff.payPage", { params: LiffPayPageParams }, liffPayPage);
const call = async (slug: string, s: SeedOrg, billId: string) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "customer", subjectId: s.ownerProfileId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/liff/${slug}/pay/${billId}`, { headers: { cookie: `cid=${encodeURIComponent(token)}` } }),
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
      subtotalSatang: 120_000,
      totalSatang: 120_000,
      paidSatang: 20_000,
      ...extra,
    })
    .returning();
  if (!b) throw new Error("bill fixture");
  return b;
}

beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

it("returns the amount due, the R-30 payload and the masked account", async () => {
  const s = await shop("pp1");
  const res = await call("shop-pp1", s, (await openBill(s)).id);
  expect(res.status).toBe(200);
  const body = (await res.json()) as LiffPayPageResponse;
  expect(LiffPayPageResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({ amountSatang: 100_000, accountName: "ร้าน", promptpayIdMasked: "678", expiresAt: null });
  expect(body.promptpayPayload).toMatch(/^000201/);
});

it("not the customer's / another shop's / unknown → NOT_FOUND; paid → BILL_NOT_OPEN; no PromptPay → PROMPTPAY_NOT_CONFIGURED; bad id → VALIDATION_FAILED", async () => {
  const s = await shop("pp2");
  const t = await shop("pp3");
  const [someone] = await env.db.insert(customer).values({ organizationId: s.orgId, ownerProfileId: t.ownerProfileId }).returning();
  for (const id of [(await openBill(s, { customerId: someone?.id })).id, (await openBill(t)).id, crypto.randomUUID()])
    expect(await errorCode(await call("shop-pp2", s, id))).toBe("NOT_FOUND");
  expect(await errorCode(await call("shop-pp2", s, (await openBill(s, { status: "paid", paidSatang: 120_000 })).id))).toBe("BILL_NOT_OPEN");
  expect(await errorCode(await call("shop-pp2", s, "nope"))).toBe("VALIDATION_FAILED");
  await env.db.update(branch).set({ promptpayType: null, promptpayId: null }).where(eq(branch.id, s.branchId));
  expect(await errorCode(await call("shop-pp2", s, (await openBill(s)).id))).toBe("PROMPTPAY_NOT_CONFIGURED");
});
