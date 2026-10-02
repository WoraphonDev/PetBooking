import { LineStatusRequest, LineStatusResponse } from "@app/contracts/endpoints/line.status";
import { branch, lineChannel, notification } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http.ts";
import { lineStatus } from "../../../src/services/line/status.ts";
import { otherOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let foreignBranch: string;
const GET = withStaff("line.status", { query: LineStatusRequest }, lineStatus);
beforeAll(async () => {
  env = await setupTestDb();
  foreignBranch = (await otherOrg(env.db)).branchId;
});
afterAll(async () => {
  await env.close();
});
async function cookie(role: "owner" | "front_desk" | "staff") {
  const session = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff[role], organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  return `sid=${session.token}`;
}
it("returns the exact status fields and R-18 branch/month counts without exposing credentials", async () => {
  const [second] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Second", bookingSlug: "second-line" })
    .returning();
  await env.db
    .insert(lineChannel)
    .values({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      providerId: "provider",
      messagingChannelId: "messaging",
      channelSecretEnc: "encrypted-secret",
      channelAccessTokenEnc: "encrypted-token",
      loginChannelId: "login",
      liffId: "liff",
      botBasicId: "@shop",
      status: "active",
      monthlyPushQuota: 300,
      webhookVerifiedAt: TEST_NOW,
    });
  const base = {
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    recipientType: "customer" as const,
    recipientId: env.base.customerId,
    templateKey: "customer.booking_confirmed",
    payload: {},
    monthKey: "2026-10",
  };
  await env.db.insert(notification).values([
    { ...base, channel: "line_push", status: "sent", dedupeKey: "used" },
    { ...base, channel: "line_reply", status: "sent", dedupeKey: "reply" },
    { ...base, channel: "line_push", status: "queued", dedupeKey: "queued" },
    { ...base, channel: "line_push", status: "sent", monthKey: "2026-09", dedupeKey: "previous" },
    { ...base, channel: "line_push", status: "skipped", skipReason: "quota_exhausted", dedupeKey: "skip" },
    { ...base, channel: "web_push", status: "skipped", skipReason: "no_recipient", dedupeKey: "skip-web" },
    { ...base, channel: "line_push", status: "sent", branchId: second?.id, dedupeKey: "other-branch" },
    {
      ...base,
      channel: "line_push",
      status: "sent",
      organizationId: (await env.db.select().from(branch)).find((b) => b.id === foreignBranch)?.organizationId ?? "",
      branchId: foreignBranch,
      recipientId: env.base.customerId,
      dedupeKey: "foreign",
    },
  ]);
  const result = await lineStatus(staffCtx(env.base, "owner"), {});
  expect(result).toEqual({
    status: "active",
    botBasicId: "@shop",
    addFriendUrl: "https://line.me/R/ti/p/@shop",
    liffUrl: "https://liff.line.me/liff",
    monthlyPushQuota: 300,
    usedThisMonth: 1,
    skippedThisMonth: 2,
    webhookVerifiedAt: TEST_NOW.toISOString(),
  });
  expect(LineStatusResponse.parse(result)).toEqual(result);
});
it.each(["owner", "front_desk"] as const)("allows %s through the thin HTTP wrapper", async (role) => {
  const response = await GET(new Request("https://petbooking.test/api/v1/staff/branch/line", { headers: { cookie: await cookie(role) } }));
  expect(response.status).toBe(200);
  expect(LineStatusResponse.parse(await response.json()).status).toBe("active");
});
it("uses the branch's local month at a UTC month boundary", async () => {
  const ctx = { ...staffCtx(env.base, "owner"), now: new Date("2026-09-30T18:00:00Z") };
  expect((await lineStatus(ctx, {})).usedThisMonth).toBe(1);
});
it("denies staff roles, absent sessions and unsupported query fields", async () => {
  await expect(lineStatus(staffCtx(env.base, "staff"), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  const url = "https://petbooking.test/api/v1/staff/branch/line";
  expect((await GET(new Request(url))).status).toBe(401);
  const invalid = await GET(new Request(`${url}?branchId=other`, { headers: { cookie: await cookie("owner") } }));
  expect(invalid.status).toBe(422);
  expect(await invalid.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});
it("returns NOT_FOUND for a foreign branch context", async () => {
  await expect(lineStatus({ ...staffCtx(env.base, "owner"), branchId: foreignBranch }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("preserves nullable bot/webhook fields and returns NOT_FOUND for an unconnected branch (Q-0035)", async () => {
  await env.db.update(lineChannel).set({ botBasicId: null, webhookVerifiedAt: null }).where(eq(lineChannel.branchId, env.base.branchId));
  expect(await lineStatus(staffCtx(env.base, "owner"), {})).toMatchObject({
    botBasicId: null,
    addFriendUrl: null,
    webhookVerifiedAt: null,
  });
  const [b] = await env.db
    .insert(branch)
    .values({ organizationId: env.base.orgId, name: "Unconnected", bookingSlug: "no-channel" })
    .returning();
  await expect(lineStatus({ ...staffCtx(env.base, "owner"), branchId: b?.id ?? null }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
});
