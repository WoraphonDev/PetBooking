import {
  AdminResolveDataRequestParams,
  AdminResolveDataRequestRequest,
  AdminResolveDataRequestResponse,
} from "@app/contracts/endpoints/admin.resolveDataRequest";
import { auditLog, bill, dataRequest, ownerProfile, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withAdmin } from "../../../src/http.ts";
import { adminResolveDataRequest } from "../../../src/services/admin/resolveDataRequest.ts";
import { otherOrg, type SeedOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
let adminId: string;
const POST = withAdmin(
  "admin.resolveDataRequest",
  { body: AdminResolveDataRequestRequest, params: AdminResolveDataRequestParams },
  adminResolveDataRequest,
);
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "x" })
    .returning();
  adminId = admin?.id ?? "";
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(async () => {
  resetRateLimits();
  await env.db
    .update(ownerProfile)
    .set({
      firstName: "มะลิ",
      lastName: "ใจดี",
      nickname: "ลิ",
      phoneE164: "+66812345678",
      email: "mali@example.test",
      addressLine: "1 ถนนสุขุมวิท",
      subdistrict: "คลองเตย",
      district: "คลองเตย",
      province: "กรุงเทพมหานคร",
      postalCode: "10110",
      erasedAt: null,
    })
    .where(eq(ownerProfile.id, env.base.ownerProfileId));
});

async function seedRequest(type: "access" | "delete", org: SeedOrg = env.base, status: "open" | "done" = "open") {
  const [row] = await env.db
    .insert(dataRequest)
    .values({ organizationId: org.orgId, ownerProfileId: org.ownerProfileId, type, status })
    .returning();
  return row?.id ?? "";
}
async function post(requestId: string, body: unknown, cookie?: string) {
  const auth = cookie ?? `aid=${(await createSession(env.db, { subjectType: "platform_admin", subjectId: adminId }, new Date())).token}`;
  return POST(
    new Request(`https://petbooking.test/api/v1/admin/data-requests/${requestId}/resolve`, {
      method: "POST",
      headers: { origin: "https://petbooking.test", cookie: auth },
      body: JSON.stringify(body),
    }),
    { params: { requestId } },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const person = async (id = env.base.ownerProfileId) => (await env.db.select().from(ownerProfile).where(eq(ownerProfile.id, id)))[0];

it("delete + done erases the person's personal values, keeps bills, audits pdpa.erase", async () => {
  const [b] = await env.db
    .insert(bill)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: env.base.customerId,
      openedBy: env.base.staff.owner,
    })
    .returning();
  const requestId = await seedRequest("delete");
  const res = await post(requestId, { status: "done", note: "ลบตามคำขอทาง LINE" });
  expect(res.status).toBe(200);
  const body = AdminResolveDataRequestResponse.parse(await res.json());
  expect(body).toMatchObject({
    id: requestId,
    orgName: "Shop a",
    ownerProfileId: env.base.ownerProfileId,
    type: "delete",
    status: "done",
    note: "ลบตามคำขอทาง LINE",
  });
  const [row] = await env.db.select().from(dataRequest).where(eq(dataRequest.id, requestId));
  expect(row).toMatchObject({ status: "done", note: "ลบตามคำขอทาง LINE", resolvedBy: adminId });
  expect(row?.resolvedAt).toBeInstanceOf(Date);
  const p = await person();
  expect(p).toMatchObject({
    firstName: "ลบแล้ว",
    lastName: null,
    nickname: null,
    phoneE164: null,
    email: null,
    addressLine: null,
    subdistrict: null,
    district: null,
    province: null,
    postalCode: null,
  });
  expect(p?.erasedAt).toEqual(row?.resolvedAt);
  expect(
    await env.db
      .select()
      .from(bill)
      .where(eq(bill.id, b?.id ?? "")),
  ).toHaveLength(1);
  const [audit] = await env.db.select().from(auditLog).where(eq(auditLog.entityId, env.base.ownerProfileId));
  expect(audit).toMatchObject({
    organizationId: env.base.orgId,
    action: "pdpa.erase",
    entityType: "owner_profile",
    actorType: "platform_admin",
    actorId: adminId,
    reason: "ลบตามคำขอทาง LINE",
  });
});

it("delete + rejected keeps the person's data and writes no erase audit", async () => {
  const requestId = await seedRequest("delete");
  const body = AdminResolveDataRequestResponse.parse(await (await post(requestId, { status: "rejected", note: "ยืนยันตัวตนไม่ได้" })).json());
  expect(body.status).toBe("rejected");
  expect((await person())?.firstName).toBe("มะลิ");
  expect(await env.db.select().from(auditLog).where(eq(auditLog.action, "pdpa.erase"))).toHaveLength(1);
});

it("access + done records the resolution only (export delivery is Q-0096)", async () => {
  const requestId = await seedRequest("access");
  const body = AdminResolveDataRequestResponse.parse(await (await post(requestId, { status: "done" })).json());
  expect(body).toMatchObject({ type: "access", status: "done", note: null });
  expect((await person())?.firstName).toBe("มะลิ");
});

it("works for a request of any shop", async () => {
  const requestId = await seedRequest("access", other);
  const body = AdminResolveDataRequestResponse.parse(await (await post(requestId, { status: "rejected" })).json());
  expect(body).toMatchObject({ orgName: "Shop b", ownerProfileId: other.ownerProfileId });
});

it("a request that is already resolved → INVALID_TRANSITION", async () => {
  const requestId = await seedRequest("delete", env.base, "done");
  expect(await codeOf(await post(requestId, { status: "done" }))).toBe("INVALID_TRANSITION");
  expect((await person())?.firstName).toBe("มะลิ");
});

it("unknown request → NOT_FOUND", async () => {
  expect(await codeOf(await post("00000000-0000-4000-8000-000000000000", { status: "done" }))).toBe("NOT_FOUND");
});

it.each([
  ["missing status", {}],
  ["status open", { status: "open" }],
  ["unknown status", { status: "erased" }],
])("VALIDATION_FAILED: %s", async (_name, body) => {
  expect(await codeOf(await post(await seedRequest("access"), body))).toBe("VALIDATION_FAILED");
});

it("needs a platform-admin session; staff contexts are refused by the service", async () => {
  const requestId = await seedRequest("delete");
  expect(await codeOf(await post(requestId, { status: "done" }, "aid=nope"))).toBe("UNAUTHENTICATED");
  await expect(adminResolveDataRequest(staffCtx(env.base, "owner"), { requestId, status: "done" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect((await person())?.firstName).toBe("มะลิ");
});
