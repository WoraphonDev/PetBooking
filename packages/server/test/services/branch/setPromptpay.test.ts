import { BranchSetPromptpayRequest, BranchSetPromptpayResponse } from "@app/contracts/endpoints/branch.setPromptpay";
import { auditLog, branch, branchPolicy, notification, staffUser } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { hashPassword } from "../../../src/auth/password.ts";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { branchSetPromptpay } from "../../../src/services/branch/setPromptpay.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("branch.setPromptpay", { body: BranchSetPromptpayRequest }, branchSetPromptpay);
const PASSWORD = "owner-pass-1234";
let env: TestEnv;
let other: SeedOrg;
let secondOwner = "";
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  for (const org of [env.base, other]) await env.db.insert(branchPolicy).values({ branchId: org.branchId });
  await env.db
    .update(staffUser)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(staffUser.id, env.base.staff.owner));
  await env.db
    .update(staffUser)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(staffUser.id, other.staff.owner));
  const [o] = await env.db
    .insert(staffUser)
    .values({ organizationId: env.base.orgId, email: "owner2@example.test", displayName: "เจ้าของร่วม", role: "owner", status: "active" })
    .returning();
  secondOwner = o?.id ?? "";
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => resetRateLimits());

const body = (over: Record<string, unknown> = {}) => ({
  type: "phone",
  id: "081-234-5678",
  accountName: "ร้านน้องหมา",
  password: PASSWORD,
  ...over,
});
async function put(input: unknown, role: "owner" | "front_desk" | "staff" = "owner", org: SeedOrg = env.base) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return ROUTE(
    new Request("https://petbooking.test/api/v1/staff/branch/promptpay", {
      method: "PUT",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(input),
    }),
    { params: {} },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const branchRow = async (id: string) => (await env.db.select().from(branch).where(eq(branch.id, id)))[0];

it("saves the account (digits only), masked response, audit without the full id, every owner notified once", async () => {
  const res = await put(body());
  expect(res.status).toBe(200);
  const settings = BranchSetPromptpayResponse.parse(await res.json());
  expect(settings.promptpay).toEqual({ type: "phone", idMasked: "*******678", accountName: "ร้านน้องหมา" });
  expect(await branchRow(env.base.branchId)).toMatchObject({
    promptpayType: "phone",
    promptpayId: "0812345678",
    promptpayAccountName: "ร้านน้องหมา",
  });
  const audits = await env.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, "promptpay.update"), eq(auditLog.entityId, env.base.branchId)));
  expect(audits).toHaveLength(1);
  expect(audits[0]?.after).toMatchObject({ idMasked: "*******678" });
  expect(JSON.stringify(audits)).not.toContain("0812345678");
  const notes = await env.db.select().from(notification).where(eq(notification.templateKey, "owner.promptpay_changed"));
  expect(notes.map((n) => n.recipientId).sort()).toEqual([env.base.staff.owner, secondOwner].sort());
  expect(notes.map((n) => n.dedupeKey)).toContain(`promptpay_changed:${audits[0]?.id}:${secondOwner}`);
  expect(notes[0]?.payload).toMatchObject({ idMasked: "*******678", byName: expect.any(String) });
});

it("an id that does not fit its type → INVALID_PROMPTPAY_ID, nothing saved", async () => {
  const before = await branchRow(env.base.branchId);
  expect(await codeOf(await put(body({ type: "national_id", id: "12345" })))).toBe("INVALID_PROMPTPAY_ID");
  expect(await branchRow(env.base.branchId)).toMatchObject({ promptpayId: before?.promptpayId });
});

it("wrong password → INVALID_CREDENTIALS, nothing saved", async () => {
  expect(await codeOf(await put(body({ id: "0899999999", password: "wrong" })))).toBe("INVALID_CREDENTIALS");
  expect((await branchRow(env.base.branchId))?.promptpayId).not.toBe("0899999999");
});

it.each([
  ["missing password", { password: undefined }],
  ["unknown type", { type: "bank" }],
  ["empty account name", { accountName: "" }],
  ["account name over 80", { accountName: "ก".repeat(81) }],
])("VALIDATION_FAILED: %s", async (_n, over) => {
  expect(await codeOf(await put(body(over)))).toBe("VALIDATION_FAILED");
});

it("front_desk / staff → FORBIDDEN; another org's owner only changes their own branch", async () => {
  expect(await codeOf(await put(body(), "front_desk"))).toBe("FORBIDDEN");
  expect(await codeOf(await put(body(), "staff"))).toBe("FORBIDDEN");
  // the branch comes from the session, so there is no foreign id to ask for: the other org's change stays there
  expect((await put(body({ id: "0811111111" }), "owner", other)).status).toBe(200);
  expect((await branchRow(other.branchId))?.promptpayId).toBe("0811111111");
  expect((await branchRow(env.base.branchId))?.promptpayId).toBe("0812345678");
});
