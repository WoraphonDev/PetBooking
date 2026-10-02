import { BillsGetParams, BillsGetResponse } from "@app/contracts/endpoints/bills.get";
import { bill, billLine, booking, payment } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { billsGet } from "../../../src/services/bills/get.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("bills.get", { params: BillsGetParams }, billsGet);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const [b] = await env.db
    .insert(bill)
    .values({
      ...tenant,
      customerId: env.base.customerId,
      openedBy: env.base.staff.front_desk,
      subtotalSatang: 50_000,
      totalSatang: 50_000,
      paidSatang: 20_000,
    })
    .returning();
  ids.bill = b?.id ?? "";
  await env.db.insert(billLine).values({
    organizationId: env.base.orgId,
    billId: ids.bill,
    lineType: "quick_item",
    description: "แชมพู",
    unitPriceSatang: 50_000,
    lineTotalSatang: 50_000,
  });
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: env.base.customerId,
      bookingNo: "B-1",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
      billId: ids.bill,
    })
    .returning();
  await env.db.insert(payment).values({ ...tenant, billId: ids.bill, bookingId: bk?.id, method: "deposit", amountSatang: 20_000 });
  const [theirs] = await env.db
    .insert(bill)
    .values({ organizationId: foreign.orgId, branchId: foreign.branchId, openedBy: foreign.staff.owner })
    .returning();
  ids.foreign = theirs?.id ?? "";
}, 60_000);
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

async function get(billId: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/bills/${billId}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: Promise.resolve({ billId }),
  });
}

it("returns the BillDetail of the bill", async () => {
  const response = await get(ids.bill ?? "");
  expect(response.status).toBe(200);
  expect(BillsGetResponse.parse(await response.json())).toMatchObject({
    id: ids.bill,
    status: "open",
    customer: { id: env.base.customerId },
    totalSatang: 50_000,
    paidSatang: 20_000,
    dueSatang: 30_000,
    lines: [{ lineType: "quick_item", description: "แชมพู", quantity: 1, lineTotalSatang: 50_000 }],
    payments: [{ method: "deposit", amountSatang: 20_000, status: "posted" }],
    openedByName: "front_desk",
  });
});

it("rejects a malformed billId with VALIDATION_FAILED", async () => {
  const response = await get("nope");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("forbids role staff", async () => {
  const response = await get(ids.bill ?? "", "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("answers NOT_FOUND for another organization's bill", async () => {
  const response = await get(ids.foreign ?? "", "owner");
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
