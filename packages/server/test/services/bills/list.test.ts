import { BillsListQuery, BillsListResponse } from "@app/contracts/endpoints/bills.list";
import { bill, payment } from "@app/db/schema";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { billsList } from "../../../src/services/bills/list.ts";
import { otherOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("bills.list", { query: BillsListQuery }, billsList);
let env: TestEnv;
const ids: Record<string, string> = {};
const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  env = await setupTestDb();
  const foreign = await otherOrg(env.db);
  const tenant = { organizationId: env.base.orgId, branchId: env.base.branchId };
  const add = async (key: string, values: Partial<typeof bill.$inferInsert>) => {
    const [row] = await env.db
      .insert(bill)
      .values({ ...tenant, openedBy: env.base.staff.owner, ...values })
      .returning();
    ids[key] = row?.id ?? "";
  };
  // 5 Oct local = [2026-10-04T17:00Z, 2026-10-05T17:00Z)
  await add("paidToday", {
    customerId: env.base.customerId,
    status: "paid",
    receiptNo: "R-1",
    subtotalSatang: 80_000,
    totalSatang: 80_000,
    paidSatang: 80_000,
    openedAt: at("2026-10-04T10:00:00Z"),
    closedAt: at("2026-10-05T02:00:00Z"),
  });
  await add("openToday", { openedAt: at("2026-10-05T03:00:00Z") });
  await add("voidToday", { status: "void", openedAt: at("2026-10-04T17:00:00Z") });
  await add("paidYesterday", { status: "paid", openedAt: at("2026-10-05T01:00:00Z"), closedAt: at("2026-10-04T16:59:00Z") });
  await env.db.insert(payment).values(
    (
      [
        ["cash", "posted"],
        ["promptpay", "posted"],
        ["cash", "posted"],
        ["card_edc", "voided"],
      ] as const
    ).map(([method, status]) => ({ ...tenant, billId: ids.paidToday, method, amountSatang: 1_000, status })),
  );
  await env.db.insert(bill).values({
    organizationId: foreign.orgId,
    branchId: foreign.branchId,
    openedBy: foreign.staff.owner,
    openedAt: at("2026-10-05T03:00:00Z"),
  });
}, 60_000);
afterAll(() => env.close());
beforeEach(() => resetRateLimits());

async function get(query: string, role: "owner" | "front_desk" | "staff" = "front_desk") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/bills${query}`, { headers: { cookie: `sid=${login.token}` } }));
}

it("lists the branch's bills newest first with BillListItem fields", async () => {
  const response = await get("");
  expect(response.status).toBe(200);
  const page = BillsListResponse.parse(await response.json());
  // listed by closed_at for paid bills, opened_at otherwise
  expect(page.items.map((b) => b.id)).toEqual([ids.openToday, ids.paidToday, ids.voidToday, ids.paidYesterday]);
  expect(page.items[1]).toEqual({
    id: ids.paidToday,
    receiptNo: "R-1",
    status: "paid",
    customerName: "Owner a",
    totalSatang: 80_000,
    paidSatang: 80_000,
    openedAt: "2026-10-04T10:00:00.000Z",
    closedAt: "2026-10-05T02:00:00.000Z",
    methods: ["cash", "promptpay"],
  });
  expect(page.items[0]?.customerName).toBeNull();
  expect(page.nextCursor).toBeNull();
});

it("filters by status and by the local day of closed_at / opened_at", async () => {
  const today = await billsList(staffCtx(env.base, "owner"), { date: "2026-10-05", limit: 50 });
  expect(today.items.map((b) => b.id)).toEqual([ids.openToday, ids.paidToday, ids.voidToday]);
  const paidToday = await billsList(staffCtx(env.base, "owner"), { status: "paid", date: "2026-10-05", limit: 50 });
  expect(paidToday.items.map((b) => b.id)).toEqual([ids.paidToday]);
  const yesterday = await billsList(staffCtx(env.base, "owner"), { date: "2026-10-04", limit: 50 });
  expect(yesterday.items.map((b) => b.id)).toEqual([ids.paidYesterday]);
});

it("pages with a keyset cursor", async () => {
  const first = await billsList(staffCtx(env.base, "owner"), { limit: 3 });
  expect(first.items).toHaveLength(3);
  expect(first.nextCursor).not.toBeNull();
  const second = await billsList(staffCtx(env.base, "owner"), { limit: 3, cursor: first.nextCursor ?? "" });
  expect(second.items.map((b) => b.id)).toEqual([ids.paidYesterday]);
  expect(second.nextCursor).toBeNull();
});

it("rejects bad filters and cursors with VALIDATION_FAILED", async () => {
  for (const query of ["?status=closed", "?date=2026-13-01", "?limit=0", "?cursor=bad"]) {
    const response = await get(query);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("forbids role staff", async () => {
  const response = await get("", "staff");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("never lists another organization's bills (NOT_FOUND for a foreign branch)", async () => {
  const page = await billsList(staffCtx(env.base, "owner"), { limit: 50 });
  expect(page.items).toHaveLength(4);
  const foreignBranch = (await env.db.select().from(bill)).find((b) => b.organizationId !== env.base.orgId)?.branchId ?? "";
  await expect(billsList({ ...staffCtx(env.base, "owner"), branchId: foreignBranch }, { limit: 50 })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
