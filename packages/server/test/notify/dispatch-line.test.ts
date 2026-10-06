// T-0324: dispatcher ⇄ LINE — reply tokens (R-19 step 2, SP-03), replies outside the R-18 quota, 401 → line_channel error + owner.line_error.
import { randomUUID } from "node:crypto";
import { branchPolicy, lineChannel, lineIdentity, notification } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTx } from "../../src/db.ts";
import { createReplyTokenStore } from "../../src/integrations/line/reply-tokens.ts";
import { dispatchQueued } from "../../src/notify/dispatch.ts";
import { enqueueNotification } from "../../src/notify/enqueue.ts";
import type { NotificationPayloads, TemplateKey } from "../../src/notify/keys.ts";
import type { NotifyDeps } from "../../src/notify/senders.ts";
import { type SeedOrg, seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());

type Sent = { lineUserId: string; text: string; replyToken?: string };
function deps(opts: { replyTokens?: NotifyDeps["replyTokens"]; lineError?: string } = {}) {
  const sent: Sent[] = [];
  const d: NotifyDeps = {
    line: {
      send: async ({ lineUserId, text, replyToken }) => {
        if (opts.lineError) throw new Error(opts.lineError);
        sent.push({ lineUserId, text, ...(replyToken ? { replyToken } : {}) });
      },
    },
    webPush: { send: async () => ({ ok: true }) },
    email: { send: async () => {} },
    ...(opts.replyTokens ? { replyTokens: opts.replyTokens } : {}),
  };
  return { deps: d, sent };
}

let n = 0;
async function shop(opts: { quota?: number } = {}) {
  const s = await seedOrg(env.db, `dl${++n}`);
  await env.db.insert(lineChannel).values({
    organizationId: s.orgId,
    branchId: s.branchId,
    providerId: `prov-dl${n}`,
    messagingChannelId: `msg-dl${n}`,
    channelSecretEnc: "x",
    channelAccessTokenEnc: "x",
    loginChannelId: `login-dl${n}`,
    liffId: `liff-dl${n}`,
    monthlyPushQuota: opts.quota ?? 300,
    status: "active",
  });
  await env.db.insert(branchPolicy).values({ branchId: s.branchId, economyMode: false });
  await env.db
    .insert(lineIdentity)
    .values({ providerId: `prov-dl${n}`, lineUserId: `U-dl${n}`, ownerProfileId: s.ownerProfileId, isFriend: true });
  return { ...s, messagingChannelId: `msg-dl${n}`, lineUserId: `U-dl${n}` };
}

async function enqueue<K extends TemplateKey>(s: SeedOrg, key: K, payload: NotificationPayloads[K]) {
  const ctx = staffCtx(s, "owner");
  const row = await withTx(ctx, (tx) =>
    enqueueNotification(tx, ctx, { key, recipient: { type: "customer", id: s.customerId }, payload, dedupeKey: `${key}:${randomUUID()}` }),
  );
  if (!row) throw new Error("enqueue returned null");
  return row.id;
}

const rowOf = async (id: string) => (await env.db.select().from(notification).where(eq(notification.id, id)))[0];
const at = (seconds: number) => new Date(TEST_NOW.getTime() + seconds * 1000);
const confirmed = { bookingNo: "B-1", summary: "อาบน้ำ", dateTime: "5 ต.ค. 10:00", shopName: "Shop", bookingUrl: "b" };
const declined = { bookingNo: "B-1", reason: "เต็ม", refundLine: "" };

describe("reply tokens", () => {
  it("fresh token + template allows reply → line_reply with the token, outside the push quota", async () => {
    const s = await shop({ quota: 1 });
    const replyTokens = createReplyTokenStore();
    replyTokens.put({ messagingChannelId: s.messagingChannelId, lineUserId: s.lineUserId, token: "r-1", now: at(-10) });
    const first = await enqueue(s, "customer.booking_confirmed", confirmed);
    const { deps: d, sent } = deps({ replyTokens });
    await dispatchQueued(d, { now: TEST_NOW });
    expect(await rowOf(first)).toMatchObject({ status: "sent", channel: "line_reply" });
    expect(sent).toEqual([{ lineUserId: s.lineUserId, text: expect.any(String), replyToken: "r-1" }]);

    // the reply did not use the single push of the quota
    const second = await enqueue(s, "customer.booking_confirmed", confirmed);
    await dispatchQueued(d, { now: TEST_NOW });
    expect(await rowOf(second)).toMatchObject({ status: "sent", channel: "line_push" });
    expect(sent[1]).not.toHaveProperty("replyToken");
  });

  it("token older than 50 s or none → line_push", async () => {
    const s = await shop();
    const replyTokens = createReplyTokenStore();
    replyTokens.put({ messagingChannelId: s.messagingChannelId, lineUserId: s.lineUserId, token: "old", now: at(-50) });
    const old = await enqueue(s, "customer.booking_confirmed", confirmed);
    const { deps: d, sent } = deps({ replyTokens });
    await dispatchQueued(d, { now: TEST_NOW });
    expect(await rowOf(old)).toMatchObject({ status: "sent", channel: "line_push" });

    const none = await enqueue(s, "customer.booking_confirmed", confirmed);
    await dispatchQueued(deps().deps, { now: TEST_NOW });
    expect(await rowOf(none)).toMatchObject({ status: "sent", channel: "line_push" });
    expect(sent.every((m) => !m.replyToken)).toBe(true);
  });

  it("template without line_reply → push, and the token stays for a later reply", async () => {
    const s = await shop();
    const replyTokens = createReplyTokenStore();
    replyTokens.put({ messagingChannelId: s.messagingChannelId, lineUserId: s.lineUserId, token: "r-2", now: at(-5) });
    const id = await enqueue(s, "customer.booking_declined", declined);
    const { deps: d, sent } = deps({ replyTokens });
    await dispatchQueued(d, { now: TEST_NOW });
    expect(await rowOf(id)).toMatchObject({ status: "sent", channel: "line_push" });
    expect(sent[0]).not.toHaveProperty("replyToken");
    expect(replyTokens.ageSeconds({ messagingChannelId: s.messagingChannelId, lineUserId: s.lineUserId, now: TEST_NOW })).toBe(5);
  });
});

describe("401 from LINE", () => {
  it("marks line_channel error, fails the notification and enqueues owner.line_error once per day", async () => {
    const s = await shop();
    const id = await enqueue(s, "customer.booking_confirmed", confirmed);
    await dispatchQueued(deps({ lineError: "LINE delivery failed (401)" }).deps, { now: TEST_NOW });
    expect(await rowOf(id)).toMatchObject({ status: "failed", channel: "line_push", error: "LINE delivery failed (401)" });
    const [ch] = await env.db.select().from(lineChannel).where(eq(lineChannel.branchId, s.branchId));
    expect(ch?.status).toBe("error");
    const alerts = await env.db
      .select()
      .from(notification)
      .where(and(eq(notification.organizationId, s.orgId), eq(notification.templateKey, "owner.line_error")));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ recipientType: "staff", recipientId: s.staff.owner });
    expect(alerts[0]?.dedupeKey.startsWith(`line_error:${ch?.id}:2026-10-05`)).toBe(true);
  });

  it("other LINE errors fail the notification without touching the channel", async () => {
    const s = await shop();
    const id = await enqueue(s, "customer.booking_confirmed", confirmed);
    await dispatchQueued(deps({ lineError: "LINE delivery failed (500)" }).deps, { now: TEST_NOW });
    expect(await rowOf(id)).toMatchObject({ status: "failed", error: "LINE delivery failed (500)" });
    const [ch] = await env.db.select().from(lineChannel).where(eq(lineChannel.branchId, s.branchId));
    expect(ch?.status).toBe("active");
    const alerts = await env.db
      .select()
      .from(notification)
      .where(and(eq(notification.organizationId, s.orgId), eq(notification.templateKey, "owner.line_error")));
    expect(alerts).toHaveLength(0);
  });
});
