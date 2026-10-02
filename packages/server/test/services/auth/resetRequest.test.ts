import { AuthResetRequestRequest, AuthResetRequestResponse } from "@app/contracts/endpoints/auth.resetRequest";
import { notification, passwordReset } from "@app/db/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashToken } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import * as notify from "../../../src/notify/enqueue.ts";
import { authResetRequest } from "../../../src/services/auth/resetRequest.ts";
import { otherOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const POST = withPublic("auth.resetRequest", { body: AuthResetRequestRequest }, authResetRequest);
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
  resetRateLimits();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await env.close();
  vi.unstubAllEnvs();
});
function request(body: unknown) {
  return POST(
    new Request("https://petbooking.test/api/v1/auth/staff/password-reset/request", {
      method: "POST",
      headers: { origin: "https://petbooking.test", "x-forwarded-for": "198.51.100.20" },
      body: JSON.stringify(body),
    }),
  );
}

it("creates a hashed 30-minute token and deduplicated email outbox for the matching tenant", async () => {
  const foreign = await otherOrg(env.db);
  const result = await authResetRequest(makeSystemCtx(null, TEST_NOW), AuthResetRequestRequest.parse({ email: " OWNER@B.TEST " }));
  expect(AuthResetRequestResponse.safeParse(result).success).toBe(true);
  const [reset] = await env.db.select().from(passwordReset);
  const [queued] = await env.db.select().from(notification);
  expect(reset).toMatchObject({
    staffUserId: foreign.staff.owner,
    usedAt: null,
    createdAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + 30 * 60_000),
  });
  expect(queued).toMatchObject({
    organizationId: foreign.orgId,
    branchId: foreign.branchId,
    recipientType: "staff",
    recipientId: foreign.staff.owner,
    templateKey: "staff.password_reset",
    channel: "email",
    status: "queued",
    dedupeKey: `pwreset:${reset?.id}:${foreign.staff.owner}`,
  });
  if (!queued) throw new Error("Expected queued reset email");
  const url = new URL((queued.payload as { resetUrl: string }).resetUrl);
  expect(url.origin).toBe("https://petbooking.test");
  expect(url.pathname).toBe("/reset-password");
  const token = url.searchParams.get("token");
  expect(token).toBeTruthy();
  expect(reset?.tokenHash).toBe(hashToken(token ?? ""));
  expect(reset?.tokenHash).not.toBe(token);
});
it("returns identical 204 responses for known and unknown emails", async () => {
  for (const email of ["owner@a.test", "missing@example.test"]) {
    const response = await request({ email });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(await env.db.select().from(passwordReset)).toHaveLength(1);
  expect(await env.db.select().from(notification)).toHaveLength(1);
});
it("validates email and rate limits the eleventh request", async () => {
  for (const body of [{}, { email: "bad" }, { email: null }]) {
    const response = await request(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  resetRateLimits();
  for (let i = 0; i < 10; i++) expect((await request({ email: "missing@example.test" })).status).toBe(204);
  const response = await request({ email: "missing@example.test" });
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  expect(await env.db.select().from(passwordReset)).toHaveLength(0);
});
it("rolls back the token when enqueueing fails", async () => {
  vi.spyOn(notify, "enqueueNotification").mockRejectedValueOnce(new Error("outbox unavailable"));
  await expect(authResetRequest(makeSystemCtx(null, TEST_NOW), { email: "owner@a.test" })).rejects.toThrow("outbox unavailable");
  expect(await env.db.select().from(passwordReset)).toHaveLength(0);
  expect(await env.db.select().from(notification)).toHaveLength(0);
});
