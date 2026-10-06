// T-0105 staffMe.linkLine: link the caller's LINE account (platform LINE Login) → staff_user.line_user_id.
import { StaffMeLinkLineRequest, StaffMeLinkLineResponse } from "@app/contracts/endpoints/staffMe.linkLine";
import { staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { staffMeLinkLine } from "../../../src/services/staffMe/linkLine.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
const POST = withStaff("staffMe.linkLine", { body: StaffMeLinkLineRequest }, staffMeLinkLine);
const call = async (s: SeedOrg, staffId: string, body: unknown) => {
  const { token } = await createSession(
    env.db,
    { subjectType: "staff", subjectId: staffId, organizationId: s.orgId, branchId: s.branchId },
    new Date(),
  );
  return POST(
    new Request("https://petbooking.test/api/v1/staff/me/line-link", {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `sid=${token}` },
      body: JSON.stringify(body),
    }),
  );
};
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
});
afterAll(() => env.close());
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  vi.stubEnv("PLATFORM_LINE_LOGIN_CHANNEL_ID", "2000000001");
  vi.stubEnv("LINE_FAKE", "");
  resetRateLimits();
  return () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  };
});

it.each(["owner", "front_desk", "staff"] as const)("%s links the LINE account verified with the platform channel", async (role) => {
  const verify = vi.fn(async () => Response.json({ sub: `U-${role}`, aud: "2000000001" }));
  vi.stubGlobal("fetch", verify);
  const res = await call(env.base, env.base.staff[role], { idToken: "token" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as StaffMeLinkLineResponse;
  expect(StaffMeLinkLineResponse.safeParse(body).success).toBe(true);
  expect(body.staff).toMatchObject({ id: env.base.staff[role], role, lineLinked: true });
  const [row] = await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff[role]));
  expect(row?.lineUserId).toBe(`U-${role}`);
  expect(String((verify.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain("client_id=2000000001");
});

it("relinking the same LINE account is fine; one linked to another staff member (any shop) → EMAIL_TAKEN", async () => {
  vi.stubEnv("LINE_FAKE", "1");
  expect((await call(env.base, env.base.staff.owner, { idToken: "fake:U-owner:x" })).status).toBe(200);
  await env.db.update(staffUser).set({ lineUserId: "U-elsewhere" }).where(eq(staffUser.id, other.staff.owner));
  expect(await errorCode(await call(env.base, env.base.staff.owner, { idToken: "fake:U-elsewhere:x" }))).toBe("EMAIL_TAKEN");
  const [row] = await env.db.select().from(staffUser).where(eq(staffUser.id, env.base.staff.owner));
  expect(row?.lineUserId).toBe("U-owner");
});

it("a token LINE rejects → LINE_TOKEN_INVALID; missing idToken → VALIDATION_FAILED", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 400 })),
  );
  expect(await errorCode(await call(env.base, env.base.staff.staff, { idToken: "bad" }))).toBe("LINE_TOKEN_INVALID");
  for (const body of [{}, { idToken: "" }])
    expect(await errorCode(await call(env.base, env.base.staff.staff, body))).toBe("VALIDATION_FAILED");
});

it("a session naming a staff member of another organization is rejected by the sid check (UNAUTHENTICATED), nothing linked", async () => {
  vi.stubEnv("LINE_FAKE", "1");
  // sid of org A naming a staff member of org B
  const res = await call(env.base, other.staff.staff, { idToken: "fake:U-cross:x" });
  expect(await errorCode(res)).toBe("UNAUTHENTICATED");
  const [row] = await env.db.select().from(staffUser).where(eq(staffUser.id, other.staff.staff));
  expect(row?.lineUserId).toBeNull();
});
