// T-0104 auth.staffLine: staff sign in with the platform's LINE Login → sid session + StaffMe.
import { AuthStaffLineRequest, AuthStaffLineResponse } from "@app/contracts/endpoints/auth.staffLine";
import { session, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { hashToken } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import { authStaffLine } from "../../../src/services/auth/staffLine.ts";
import { setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
const POST = withPublic("auth.staffLine", { body: AuthStaffLineRequest }, authStaffLine);
let ip = 0;
const call = (body: unknown) =>
  POST(
    new Request("https://petbooking.test/api/v1/auth/staff/line", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://petbooking.test", "x-forwarded-for": `198.51.100.${++ip}` },
      body: JSON.stringify(body),
    }),
  );
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const cookieToken = (res: Response) => decodeURIComponent(/sid=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "");

beforeAll(async () => {
  env = await setupTestDb();
  await env.db.update(staffUser).set({ lineUserId: "Ugroomer" }).where(eq(staffUser.id, env.base.staff.staff));
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

it("verifies the token with the platform channel, opens a staff session and returns StaffMe", async () => {
  const verify = vi.fn(async () => Response.json({ sub: "Ugroomer", aud: "2000000001", name: "ช่างเอ" }));
  vi.stubGlobal("fetch", verify);
  const res = await call({ idToken: "real-token" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as AuthStaffLineResponse;
  expect(AuthStaffLineResponse.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({
    staff: { id: env.base.staff.staff, role: "staff", lineLinked: true },
    organization: { id: env.base.orgId },
    branch: { id: env.base.branchId, bookingSlug: "shop-a" },
    supportMode: false,
  });
  const init = (verify.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(String(init.body)).toContain("client_id=2000000001");
  const [row] = await env.db
    .select()
    .from(session)
    .where(eq(session.tokenHash, hashToken(cookieToken(res))));
  expect(row).toMatchObject({
    subjectType: "staff",
    subjectId: env.base.staff.staff,
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
  });
});

it("a token LINE rejects or issued to another channel → LINE_TOKEN_INVALID", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "invalid_request" }, { status: 400 })),
  );
  expect(await errorCode(await call({ idToken: "expired" }))).toBe("LINE_TOKEN_INVALID");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ sub: "Ugroomer", aud: "shop-channel" })),
  );
  expect(await errorCode(await call({ idToken: "wrong-channel" }))).toBe("LINE_TOKEN_INVALID");
});

it("no active staff with that LINE user → INVALID_CREDENTIALS (LINE_FAKE token)", async () => {
  vi.stubEnv("LINE_FAKE", "1");
  expect(await errorCode(await call({ idToken: "fake:Unobody:ใครก็ได้" }))).toBe("INVALID_CREDENTIALS");
  await env.db.update(staffUser).set({ lineUserId: "Uleft", status: "disabled" }).where(eq(staffUser.id, env.base.staff.front_desk));
  expect(await errorCode(await call({ idToken: "fake:Uleft:ลาออกแล้ว" }))).toBe("INVALID_CREDENTIALS");
  expect((await call({ idToken: "fake:Ugroomer:ช่างเอ" })).status).toBe(200);
});

it("missing / empty idToken → VALIDATION_FAILED", async () => {
  for (const body of [{}, { idToken: "" }, { idToken: 1 }]) expect(await errorCode(await call(body))).toBe("VALIDATION_FAILED");
});
