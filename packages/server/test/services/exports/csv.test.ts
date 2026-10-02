import { ExportsCsvParams, ExportsCsvQuery, ExportsCsvResponse } from "@app/contracts/endpoints/exports.csv";
import { auditLog, bill, customer, ownerProfile, pet } from "@app/db/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { exportsCsv } from "../../../src/services/exports/csv.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("exports.csv", { query: ExportsCsvQuery, params: ExportsCsvParams }, exportsCsv);
let env: TestEnv;
let foreign: SeedOrg;

beforeEach(async () => {
  env = await setupTestDb();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  resetRateLimits();
  foreign = await otherOrg(env.db);
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

async function get(type: string, query = "", role: "owner" | "front_desk" | "staff" = "owner") {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return GET(new Request(`https://petbooking.test/api/v1/staff/exports/${type}.csv${query}`, { headers: { cookie: `sid=${login.token}` } }), {
    params: Promise.resolve({ type }),
  });
}
const parse = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

async function seedBill(org: SeedOrg, closedAt: Date | null, totalSatang: number, note: string | null = null) {
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: org.orgId,
      branchId: org.branchId,
      customerId: org.customerId,
      status: closedAt ? "paid" : "open",
      subtotalSatang: totalSatang,
      totalSatang,
      paidSatang: closedAt ? totalSatang : 0,
      openedBy: org.staff.owner,
      closedAt,
      receiptNo: closedAt ? `R-${totalSatang}` : null,
      note,
    })
    .returning();
  if (!b) throw new Error("seed: bill");
  return b;
}

it("exports bills as BOM CSV with snake_case header and baht money, filtered by local closed_at days", async () => {
  const inRange = await seedBill(env.base, new Date("2026-10-01T17:30:00Z"), 123450, 'มี "คอมม่า", ด้วย'); // 2 Oct 00:30 Bangkok
  await seedBill(env.base, new Date("2026-10-01T16:30:00Z"), 5000); // 1 Oct 23:30 Bangkok → outside
  await seedBill(foreign, new Date("2026-10-02T03:00:00Z"), 7000);
  const response = await get("bills", "?from=2026-10-02&to=2026-10-02");
  expect(response.status).toBe(200);
  const csv = ExportsCsvResponse.parse(await response.json());
  expect(csv.startsWith("﻿")).toBe(true);
  const [header, ...rows] = parse(csv);
  expect(header?.split(",")).toEqual([
    "id",
    "branch_id",
    "customer_id",
    "receipt_no",
    "status",
    "subtotal",
    "bill_discount",
    "bill_discount_reason",
    "total",
    "paid",
    "change",
    "opened_by",
    "opened_at",
    "closed_by",
    "closed_at",
    "voided_by",
    "voided_at",
    "void_reason",
    "note",
    "created_at",
    "updated_at",
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain(`${inRange.id},${env.base.branchId},${env.base.customerId},R-123450,paid,1234.50,0.00,,1234.50,1234.50,0.00,`);
  expect(rows[0]).toContain(',2026-10-01T17:30:00.000Z,');
  expect(rows[0]).toContain(',"มี ""คอมม่า"", ด้วย",');
});

it("exports every type for the owner's organization only", async () => {
  await seedBill(env.base, TEST_NOW, 100);
  const [profile] = await env.db.insert(ownerProfile).values({ createdInOrgId: foreign.orgId, firstName: "x" }).returning();
  await env.db.insert(pet).values([
    { ownerProfileId: env.base.ownerProfileId, createdInOrgId: env.base.orgId, name: "โมจิ", species: "dog" },
    { ownerProfileId: profile!.id, createdInOrgId: foreign.orgId, name: "Other", species: "cat" },
  ]);
  const customers = parse(await (await get("customers")).json());
  expect(customers[0]).toMatch(/^id,owner_profile_id,/);
  expect(customers[0]).toContain(",credit_balance,");
  expect(customers.slice(1).map((r) => r.split(",")[0])).toEqual([env.base.customerId]);
  const pets = parse(await (await get("pets")).json());
  expect(pets).toHaveLength(2);
  expect(pets[1]).toContain(",โมจิ,dog,");
  for (const type of ["bill_lines", "commissions", "bookings"]) {
    const response = await get(type);
    expect(response.status).toBe(200);
    expect(parse(await response.json())).toHaveLength(1);
  }
  expect(parse(await (await get("bills")).json())).toHaveLength(2);
});

it("writes audit data.export in the same transaction, stamped with ctx.now", async () => {
  await seedBill(env.base, TEST_NOW, 100);
  await exportsCsv(staffCtx(env.base, "owner"), { type: "bills", from: "2026-10-01", to: "2026-10-31" });
  expect(await env.db.select().from(auditLog)).toEqual([
    expect.objectContaining({
      organizationId: env.base.orgId,
      action: "data.export",
      actorType: "staff",
      actorId: env.base.staff.owner,
      entityType: "bills",
      entityId: null,
      after: { type: "bills", from: "2026-10-01", to: "2026-10-31", rowCount: 1 },
      createdAt: TEST_NOW,
    }),
  ]);
});

it("rejects an unknown type or bad dates with VALIDATION_FAILED", async () => {
  for (const [type, query] of [
    ["payments", ""],
    ["bills", "?from=2026-13-01"],
    ["bills", "?from=2026-10-05&to=2026-10-01"],
  ] as const) {
    const response = await get(type, query);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
});

it("forbids front_desk and staff without auditing", async () => {
  for (const role of ["front_desk", "staff"] as const) {
    const response = await get("customers", "", role);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  }
  expect(await env.db.select().from(auditLog)).toEqual([]);
});

it("never includes another organization's rows (NOT_FOUND by omission)", async () => {
  await env.db.insert(customer).values({ organizationId: foreign.orgId, ownerProfileId: foreign.ownerProfileId });
  const rows = parse(await (await get("customers")).json()).slice(1);
  expect(rows.map((r) => r.split(",")[0])).toEqual([env.base.customerId]);
});
