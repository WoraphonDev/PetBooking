import { ReportsSalesQuery, ReportsSalesResponse } from "@app/contracts/endpoints/reports.sales";
import { bill, billLine, payment } from "@app/db/schema";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { reportsSales } from "../../../src/services/reports/sales.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("reports.sales", { query: ReportsSalesQuery }, reportsSales);
let env: TestEnv;
const bkk = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

/**
 * Bill A (4 Oct): bath 500 − line 50 by `staff` + shampoo 2 × 100, bill discount 60 → total 590, paid deposit 200 + cash 390.
 * Bill B (5 Oct): shampoo 100 by `front_desk`, paid promptpay 100. Ignored: void, open, outside the range, voided payment.
 */
async function seed(org: SeedOrg) {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const paid = (closedAt: Date, subtotal: number, discount: number) => ({
    ...tenant,
    customerId: org.customerId,
    openedBy: org.staff.owner,
    status: "paid" as const,
    subtotalSatang: subtotal,
    billDiscountSatang: discount,
    billDiscountReason: discount ? "ลูกค้าประจำ" : null,
    totalSatang: subtotal - discount,
    paidSatang: subtotal - discount,
    closedAt,
  });
  const [a, b, late, voided, open] = await env.db
    .insert(bill)
    .values([
      paid(bkk("2026-10-04", "10:00"), 65_000, 6_000),
      paid(bkk("2026-10-05", "09:00"), 10_000, 0),
      paid(bkk("2026-10-06", "00:00"), 7_000, 0),
      {
        ...tenant,
        openedBy: org.staff.owner,
        status: "void" as const,
        subtotalSatang: 5_000,
        totalSatang: 5_000,
        closedAt: bkk("2026-10-04", "11:00"),
      },
      { ...tenant, openedBy: org.staff.owner, subtotalSatang: 3_000, totalSatang: 3_000 },
    ])
    .returning();
  const line = (billId: string, description: string, qty: number, unit: number, disc: number, performerId: string | null) => ({
    organizationId: org.orgId,
    billId,
    lineType: "quick_item" as const,
    description,
    quantity: qty,
    unitPriceSatang: unit,
    lineDiscountSatang: disc,
    lineDiscountReason: disc ? "ลด" : null,
    lineTotalSatang: qty * unit - disc,
    performerId,
  });
  await env.db
    .insert(billLine)
    .values([
      { ...line(a?.id ?? "", "อาบน้ำ", 1, 50_000, 5_000, org.staff.staff), lineType: "groom_service" as const },
      line(a?.id ?? "", "แชมพู", 2, 10_000, 0, null),
      line(b?.id ?? "", "แชมพู", 1, 10_000, 0, org.staff.front_desk),
      line(late?.id ?? "", "แชมพู", 1, 7_000, 0, null),
      line(voided?.id ?? "", "แชมพู", 1, 5_000, 0, null),
      line(open?.id ?? "", "แชมพู", 1, 3_000, 0, null),
    ]);
  await env.db.insert(payment).values([
    { ...tenant, billId: a?.id, method: "deposit", amountSatang: 20_000 },
    { ...tenant, billId: a?.id, method: "cash", amountSatang: 39_000 },
    { ...tenant, billId: a?.id, method: "cash", amountSatang: 999, status: "voided" },
    { ...tenant, billId: b?.id, method: "promptpay", amountSatang: 10_000 },
    { ...tenant, billId: late?.id, method: "cash", amountSatang: 7_000 },
  ]);
}

beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  await seed(env.base);
  await seed(await otherOrg(env.db));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

const report = (groupBy: "day" | "service" | "groomer" | "method") =>
  reportsSales(staffCtx(env.base, "owner"), { from: "2026-10-04", to: "2026-10-05", groupBy });
const totals = { billCount: 2, grossSatang: 80_000, discountSatang: 11_000, netSatang: 69_000 };

it("groups paid bills by local closed_at day with gross = Σ qty × unit and net = bill totals", async () => {
  const result = ReportsSalesResponse.parse(await report("day"));
  expect(result).toEqual({
    from: "2026-10-04",
    to: "2026-10-05",
    rows: [
      { key: "2026-10-04", billCount: 1, grossSatang: 70_000, discountSatang: 11_000, netSatang: 59_000 },
      { key: "2026-10-05", billCount: 1, grossSatang: 10_000, discountSatang: 0, netSatang: 10_000 },
    ],
    totals,
    payments: expect.arrayContaining([
      { method: "deposit", amountSatang: 20_000 },
      { method: "cash", amountSatang: 39_000 },
      { method: "promptpay", amountSatang: 10_000 },
    ]),
  });
  expect(result.payments).toHaveLength(3);
});

it("spreads the bill discount over lines like R-13 #1 for service and groomer rows", async () => {
  // 6,000 over line totals 45,000 / 20,000 → 4,153 + 1,846, the remaining 1 to the largest line
  expect((await report("service")).rows).toEqual([
    { key: "อาบน้ำ", billCount: 1, grossSatang: 50_000, discountSatang: 9_154, netSatang: 40_846 },
    { key: "แชมพู", billCount: 2, grossSatang: 30_000, discountSatang: 1_846, netSatang: 28_154 },
  ]);
  expect((await report("groomer")).rows).toEqual([
    { key: "front_desk", billCount: 1, grossSatang: 10_000, discountSatang: 0, netSatang: 10_000 },
    { key: "staff", billCount: 1, grossSatang: 50_000, discountSatang: 9_154, netSatang: 40_846 },
    { key: null, billCount: 1, grossSatang: 20_000, discountSatang: 1_846, netSatang: 18_154 },
  ]);
  expect((await report("groomer")).totals).toEqual(totals);
});

it("reports posted payments per method (no gross/discount on method rows)", async () => {
  expect((await report("method")).rows).toEqual([
    { key: "cash", billCount: 1, grossSatang: 0, discountSatang: 0, netSatang: 39_000 },
    { key: "deposit", billCount: 1, grossSatang: 0, discountSatang: 0, netSatang: 20_000 },
    { key: "promptpay", billCount: 1, grossSatang: 0, discountSatang: 0, netSatang: 10_000 },
  ]);
});

it("returns empty rows and zero totals for a range without paid bills", async () => {
  expect(await reportsSales(staffCtx(env.base, "owner"), { from: "2026-09-01", to: "2026-09-02", groupBy: "day" })).toEqual({
    from: "2026-09-01",
    to: "2026-09-02",
    rows: [],
    totals: { billCount: 0, grossSatang: 0, discountSatang: 0, netSatang: 0 },
    payments: [],
  });
});

async function get(query: string, role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/reports/sales?${query}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: Promise.resolve({}),
  });
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("validates the query, allows only the owner and counts only this organization", async () => {
  for (const query of [
    "from=2026-10-04&to=2026-10-05",
    "from=2026-10-05&to=2026-10-04&groupBy=day",
    "from=2026-01-01&to=2027-01-02&groupBy=day",
    "from=2026-10-04&to=2026-10-05&groupBy=week",
  ]) {
    const response = await get(query);
    expect(response.status, query).toBe(422);
    expect(await code(response)).toBe("VALIDATION_FAILED");
  }
  for (const role of ["front_desk", "staff"] as const) {
    const response = await get("from=2026-10-04&to=2026-10-05&groupBy=day", role);
    expect(response.status).toBe(403);
    expect(await code(response)).toBe("FORBIDDEN");
  }
  const ok = await get("from=2026-10-04&to=2026-10-05&groupBy=day");
  expect(ok.status).toBe(200);
  expect(ReportsSalesResponse.parse(await ok.json()).totals).toEqual(totals);
});
