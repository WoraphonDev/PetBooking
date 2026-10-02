import { BillsUpdateLineParams, BillsUpdateLineRequest, BillsUpdateLineResponse } from "@app/contracts/endpoints/bills.updateLine";
import { auditLog, bill, billLine } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { billsUpdateLine } from "../../../src/services/bills/updateLine.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const PATCH = withStaff("bills.updateLine", { body: BillsUpdateLineRequest, params: BillsUpdateLineParams }, billsUpdateLine);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

/** open bill: bath 2 × 450 (groom_service) + shampoo 1 × 100 (quick_item) = 1,000 */
async function seed(org: SeedOrg) {
  const [b] = await env.db
    .insert(bill)
    .values({ organizationId: org.orgId, branchId: org.branchId, openedBy: org.staff.owner, subtotalSatang: 100_000, totalSatang: 100_000 })
    .returning();
  const [groom, quick] = await env.db
    .insert(billLine)
    .values([
      {
        organizationId: org.orgId,
        billId: b?.id ?? "",
        lineType: "groom_service",
        description: "อาบน้ำ",
        quantity: 2,
        unitPriceSatang: 45_000,
        lineTotalSatang: 90_000,
        sortOrder: 0,
      },
      {
        organizationId: org.orgId,
        billId: b?.id ?? "",
        lineType: "quick_item",
        description: "แชมพู",
        unitPriceSatang: 10_000,
        lineTotalSatang: 10_000,
        sortOrder: 1,
      },
    ])
    .returning();
  return { bill: b?.id ?? "", groom: groom?.id ?? "", quick: quick?.id ?? "" };
}

beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  foreign = await otherOrg(env.db);
  Object.assign(ids, await seed(env.base));
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

async function patch(lineId: string, body: unknown, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return PATCH(
    new Request(`https://petbooking.test/api/v1/staff/bill-lines/${lineId}`, {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ lineId }) },
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const billRow = async () =>
  (
    await env.db
      .select()
      .from(bill)
      .where(eq(bill.id, ids.bill ?? ""))
  )[0];

it("applies a line discount with reason, recomputes the bill and audits bill.discount", async () => {
  const response = await patch(ids.groom ?? "", { lineDiscountSatang: 10_000, lineDiscountReason: " ลูกค้าประจำ " });
  expect(response.status).toBe(200);
  const detail = BillsUpdateLineResponse.parse(await response.json());
  expect(detail).toMatchObject({ subtotalSatang: 90_000, totalSatang: 90_000, dueSatang: 90_000 });
  expect(detail.lines[0]).toMatchObject({ lineDiscountSatang: 10_000, lineDiscountReason: "ลูกค้าประจำ", lineTotalSatang: 80_000 });
  expect(await billRow()).toMatchObject({ subtotalSatang: 90_000, totalSatang: 90_000 });
  expect(await env.db.select().from(auditLog)).toEqual([
    expect.objectContaining({
      action: "bill.discount",
      entityType: "bill_line",
      entityId: ids.groom,
      before: { lineDiscountSatang: 0, lineDiscountReason: null },
      after: { lineDiscountSatang: 10_000, lineDiscountReason: "ลูกค้าประจำ" },
      reason: "ลูกค้าประจำ",
    }),
  ]);
});

it("changes the performer and a quick_item quantity in place without auditing", async () => {
  const detail = await billsUpdateLine(
    { ...staffCtx(env.base, "front_desk"), now: TEST_NOW },
    { lineId: ids.quick ?? "", quantity: 3, performerId: env.base.staff.staff },
  );
  expect(detail.lines[1]).toMatchObject({ id: ids.quick, quantity: 3, lineTotalSatang: 30_000, performerId: env.base.staff.staff });
  expect(detail.totalSatang).toBe(120_000);
  await billsUpdateLine(staffCtx(env.base, "owner"), { lineId: ids.quick ?? "", performerId: null });
  expect(
    (
      await env.db
        .select()
        .from(billLine)
        .where(eq(billLine.id, ids.quick ?? ""))
    )[0]?.performerId,
  ).toBeNull();
  expect(await env.db.select().from(auditLog)).toEqual([]);
});

it("REASON_REQUIRED without a reason, LINE_DISCOUNT_TOO_LARGE above qty × unit", async () => {
  const noReason = await patch(ids.groom ?? "", { lineDiscountSatang: 5_000 });
  expect(noReason.status).toBe(422);
  expect(await code(noReason)).toBe("REASON_REQUIRED");
  expect(await code(await patch(ids.groom ?? "", { lineDiscountSatang: 5_000, lineDiscountReason: "ab" }))).toBe("REASON_REQUIRED");
  const tooLarge = await patch(ids.groom ?? "", { lineDiscountSatang: 90_001, lineDiscountReason: "เกินยอด" });
  expect(tooLarge.status).toBe(422);
  expect(await code(tooLarge)).toBe("LINE_DISCOUNT_TOO_LARGE");
  expect(await env.db.select().from(auditLog)).toEqual([]);
});

it("DISCOUNT_LIMIT_EXCEEDED for front_desk above 20% of the bill; owner may go further", async () => {
  const over = await patch(ids.groom ?? "", { lineDiscountSatang: 20_001, lineDiscountReason: "โปรโมชัน" }, "front_desk");
  expect(over.status).toBe(403);
  expect(await code(over)).toBe("DISCOUNT_LIMIT_EXCEEDED");
  expect((await patch(ids.groom ?? "", { lineDiscountSatang: 20_000, lineDiscountReason: "โปรโมชัน" }, "front_desk")).status).toBe(200);
  expect((await patch(ids.groom ?? "", { lineDiscountSatang: 50_000, lineDiscountReason: "เจ้าของอนุมัติ" }, "owner")).status).toBe(200);
});

it("BILL_NOT_OPEN on a paid or void bill", async () => {
  for (const status of ["paid", "void"] as const) {
    await env.db
      .update(bill)
      .set({ status, paidSatang: status === "paid" ? 100_000 : 0 })
      .where(eq(bill.id, ids.bill ?? ""));
    const response = await patch(ids.groom ?? "", { performerId: env.base.staff.staff });
    expect(response.status).toBe(409);
    expect(await code(response)).toBe("BILL_NOT_OPEN");
  }
});

it("rejects malformed bodies, quantity on a non-quick_item line and an unknown performer with VALIDATION_FAILED", async () => {
  for (const [line, body] of [
    [ids.groom, { lineDiscountSatang: -1 }],
    [ids.groom, { quantity: 0 }],
    [ids.groom, { quantity: 3 }],
    [ids.groom, { performerId: foreign.staff.owner }],
    ["nope", {}],
  ] as const) {
    const response = await patch(line ?? "", body);
    expect(response.status).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
});

it("forbids role staff", async () => {
  const response = await patch(ids.groom ?? "", { performerId: env.base.staff.staff }, "staff");
  expect(response.status).toBe(403);
  expect(await code(response)).toBe("FORBIDDEN");
});

it("answers NOT_FOUND for another organization's line", async () => {
  const theirs = await seed(foreign);
  const response = await patch(theirs.groom, { performerId: env.base.staff.staff });
  expect(response.status).toBe(404);
  expect(await code(response)).toBe("NOT_FOUND");
});
