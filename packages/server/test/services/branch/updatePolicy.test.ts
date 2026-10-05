import { BranchUpdatePolicyRequest, BranchUpdatePolicyResponse } from "@app/contracts/endpoints/branch.updatePolicy";
import { auditLog, booking, branchPolicy, vaccineType } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { branchUpdatePolicy } from "../../../src/services/branch/updatePolicy.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("branch.updatePolicy", { body: BranchUpdatePolicyRequest }, branchUpdatePolicy);
let env: TestEnv;
let other: SeedOrg;
const codes = { dog: "", cat: "" };
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) await env.db.insert(branchPolicy).values({ branchId: org.branchId });
  const types = await env.db.select().from(vaccineType);
  codes.dog = types.find((t) => t.species === "dog")?.code ?? "";
  codes.cat = types.find((t) => t.species === "cat")?.code ?? "";
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

async function patch(body: unknown, role: "owner" | "front_desk" | "staff" = "owner", org: SeedOrg = env.base) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return ROUTE(
    new Request("https://petbooking.test/api/v1/staff/branch/policy", {
      method: "PATCH",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: {} },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const policyRow = async (branchId = env.base.branchId) =>
  (await env.db.select().from(branchPolicy).where(eq(branchPolicy.branchId, branchId)))[0];

it("updates only the sent fields, answers BranchPolicy, audits the changed keys, leaves booking snapshots alone", async () => {
  const [bk] = await env.db
    .insert(booking)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      customerId: env.base.customerId,
      bookingNo: "B-P1",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: { lateCancelForfeitPercent: 100 },
    })
    .returning();
  const body = {
    defaultDepositType: "percent",
    defaultDepositValue: 30,
    lateCancelForfeitPercent: 50,
    slotStepMinutes: 30,
    requiredVaccinesDog: [codes.dog],
    requiredVaccinesCat: [codes.cat],
    googleReviewUrl: "https://g.page/r/shop",
    dailySummaryTime: "21:30",
    policyText: "มาสายเกิน 15 นาทีขอเลื่อนคิว",
  };
  const res = await patch(body);
  expect(res.status).toBe(200);
  const policy = BranchUpdatePolicyResponse.parse(await res.json());
  expect(policy).toMatchObject(body);
  expect(policy.holdMinutes).toBe(15);
  expect(await policyRow()).toMatchObject({ ...body, dailySummaryTime: "21:30:00" });
  const [audit] = await env.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, "policy.update"), eq(auditLog.entityId, env.base.branchId)));
  expect(audit?.after).toMatchObject({ lateCancelForfeitPercent: 50, slotStepMinutes: 30 });
  expect(audit?.after).not.toHaveProperty("holdMinutes");
  expect(
    (
      await env.db
        .select()
        .from(booking)
        .where(eq(booking.id, bk?.id ?? ""))
    )[0]?.policySnapshot,
  ).toEqual({ lateCancelForfeitPercent: 100 });
});

it.each([
  ["percent over 100", { lateCancelForfeitPercent: 101 }],
  ["slot step 20", { slotStepMinutes: 20 }],
  ["negative hours", { groomingFreeCancelHours: -1 }],
  ["http review link", { googleReviewUrl: "http://g.page/r/shop" }],
  ["bad summary time", { dailySummaryTime: "9pm" }],
  ["unknown field", { vipMode: true }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await patch(body))).toBe("VALIDATION_FAILED");
});

it("a percent deposit over 100 and vaccine codes of the wrong species → VALIDATION_FAILED, nothing saved", async () => {
  const before = await policyRow();
  expect(await codeOf(await patch({ defaultDepositType: "percent", defaultDepositValue: 150 }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await patch({ requiredVaccinesDog: [codes.cat] }))).toBe("VALIDATION_FAILED");
  expect(await codeOf(await patch({ requiredVaccinesCat: ["NOPE"] }))).toBe("VALIDATION_FAILED");
  expect(await policyRow()).toMatchObject({
    defaultDepositValue: before?.defaultDepositValue,
    requiredVaccinesDog: before?.requiredVaccinesDog,
  });
  // a fixed deposit may exceed 100 (satang)
  expect((await patch({ defaultDepositType: "fixed", defaultDepositValue: 50_000 })).status).toBe(200);
});

it("front_desk / staff → FORBIDDEN; another org's owner changes only their own branch", async () => {
  for (const role of ["front_desk", "staff"] as const) expect(await codeOf(await patch({ holdMinutes: 20 }, role))).toBe("FORBIDDEN");
  expect((await patch({ holdMinutes: 45 }, "owner", other)).status).toBe(200);
  expect((await policyRow(other.branchId))?.holdMinutes).toBe(45);
  expect((await policyRow())?.holdMinutes).not.toBe(45);
});
