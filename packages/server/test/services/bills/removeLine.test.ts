import { BillsRemoveLineRequest, BillsRemoveLineResponse } from "@app/contracts/endpoints/bills.removeLine";
import { bill, billLine, customerPackage, packageRedemption, packageTemplate, payment, pet, service } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { billsRemoveLine } from "../../../src/services/bills/removeLine.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("bills.removeLine", { params: BillsRemoveLineRequest }, billsRemoveLine);
let env: TestEnv;
let foreign: SeedOrg;
let s: Awaited<ReturnType<typeof seedBill>>;
beforeAll(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  foreign = await otherOrg(env.db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  s = await seedBill(env.base);
});

/** open bill of the base customer: quick item 300 + booking groom line 500 + counter package redemption (last session); cash 100 + credit 50 posted */
async function seedBill(org: SeedOrg, status: "open" | "paid" = "open") {
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [b] = await env.db
    .insert(bill)
    .values({
      ...tenant,
      customerId: org.customerId,
      openedBy: org.staff.owner,
      subtotalSatang: 80_000,
      totalSatang: 80_000,
      paidSatang: 15_000,
    })
    .returning();
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" })
    .returning();
  const [bath] = await env.db
    .insert(service)
    .values({ ...tenant, category: "bath", nameTh: "อาบน้ำ" })
    .returning();
  const [tpl] = await env.db
    .insert(packageTemplate)
    .values({ ...tenant, nameTh: "อาบ 5 ครั้ง", serviceId: bath?.id ?? "", sessionsCount: 5, priceSatang: 200_000 })
    .returning();
  const [pkg] = await env.db
    .insert(customerPackage)
    .values({
      organizationId: org.orgId,
      customerId: org.customerId,
      templateId: tpl?.id ?? "",
      petId: mochi?.id ?? "",
      sessionsTotal: 5,
      sessionsUsed: 5,
      status: "exhausted",
      unitValueSatang: 40_000,
      purchasedBillId: b?.id ?? "",
      expiresAt: new Date(TEST_NOW.getTime() + 86_400_000 * 100),
    })
    .returning();
  const line = { organizationId: org.orgId, billId: b?.id ?? "" };
  const [quick, groom, redemption] = await env.db
    .insert(billLine)
    .values([
      { ...line, lineType: "quick_item", description: "แชมพู", unitPriceSatang: 30_000, lineTotalSatang: 30_000, sortOrder: 0 },
      {
        ...line,
        lineType: "groom_service",
        refType: "groom_appointment_item",
        refId: crypto.randomUUID(),
        description: "อาบน้ำ",
        unitPriceSatang: 50_000,
        lineTotalSatang: 50_000,
        sortOrder: 1,
      },
      {
        ...line,
        lineType: "package_redemption",
        refType: "customer_package",
        refId: pkg?.id,
        petId: mochi?.id,
        description: "อาบ 5 ครั้ง",
        unitPriceSatang: 0,
        lineTotalSatang: 0,
        sortOrder: 2,
      },
    ])
    .returning();
  await env.db.insert(packageRedemption).values({
    organizationId: org.orgId,
    customerPackageId: pkg?.id ?? "",
    billLineId: redemption?.id ?? "",
    petId: mochi?.id ?? "",
    redeemedAt: TEST_NOW,
  });
  const [cash, credit] = await env.db
    .insert(payment)
    .values([
      { ...tenant, billId: b?.id, method: "cash", amountSatang: 10_000, receivedBy: org.staff.owner },
      { ...tenant, billId: b?.id, method: "credit", amountSatang: 5_000, receivedBy: org.staff.owner },
    ])
    .returning();
  if (status !== "open")
    await env.db
      .update(bill)
      .set({ status, closedAt: TEST_NOW, paidSatang: 80_000 })
      .where(eq(bill.id, b?.id ?? ""));
  return {
    billId: b?.id ?? "",
    quickId: quick?.id ?? "",
    groomId: groom?.id ?? "",
    redemptionId: redemption?.id ?? "",
    packageId: pkg?.id ?? "",
    cashId: cash?.id ?? "",
    creditId: credit?.id ?? "",
  };
}

async function call(id: string, _body: unknown, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return ROUTE(
    new Request(`https://petbooking.test/api/v1/staff/bill-lines/${id}`, {
      method: "DELETE",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
    }),
    { params: Promise.resolve({ lineId: id }) },
  );
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const _billOf = async (id: string) => (await env.db.select().from(bill).where(eq(bill.id, id)))[0];

it("removes a quick item over HTTP and recomputes the totals (BillDetail)", async () => {
  const response = await call(s.quickId, undefined);
  expect(response.status).toBe(200);
  const detail = BillsRemoveLineResponse.parse(await response.json());
  expect(detail.lines.map((l) => l.lineType)).toEqual(["groom_service", "package_redemption"]);
  expect(detail).toMatchObject({ subtotalSatang: 50_000, totalSatang: 50_000, paidSatang: 15_000, dueSatang: 35_000 });
  expect(await env.db.select().from(billLine).where(eq(billLine.id, s.quickId))).toEqual([]);
});

it("gives the session back when a counter redemption is removed", async () => {
  await billsRemoveLine(staffCtx(env.base, "owner"), { lineId: s.redemptionId });
  expect(await env.db.select().from(packageRedemption).where(eq(packageRedemption.billLineId, s.redemptionId))).toEqual([]);
  expect((await env.db.select().from(customerPackage).where(eq(customerPackage.id, s.packageId)))[0]).toMatchObject({
    sessionsUsed: 4,
    status: "active",
  });
});

it("refuses booking lines (cancel the booking child instead) with VALIDATION_FAILED", async () => {
  await expect(billsRemoveLine(staffCtx(env.base, "owner"), { lineId: s.groomId })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(await env.db.select().from(billLine).where(eq(billLine.id, s.groomId))).toHaveLength(1);
});

it("refuses a line of a bill that is not open with BILL_NOT_OPEN", async () => {
  const paid = await seedBill(env.base, "paid");
  await expect(billsRemoveLine(staffCtx(env.base, "owner"), { lineId: paid.quickId })).rejects.toMatchObject({ code: "BILL_NOT_OPEN" });
});

it("rejects a malformed lineId, forbids staff and hides another organization's line", async () => {
  const bad = await call("not-a-uuid", undefined);
  expect(bad.status).toBe(422);
  expect(await code(bad)).toBe("VALIDATION_FAILED");
  const forbidden = await call(s.quickId, undefined, "staff");
  expect(forbidden.status).toBe(403);
  expect(await code(forbidden)).toBe("FORBIDDEN");
  const other = await seedBill(foreign);
  const hidden = await call(other.quickId, undefined);
  expect(hidden.status).toBe(404);
  expect(await code(hidden)).toBe("NOT_FOUND");
});
