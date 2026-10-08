// T-0331 (Q-1048): customer templates with a url go out on LINE as a plain Flex bubble (text + LIFF button), altText = first line.
import { randomBytes, randomUUID } from "node:crypto";
import { branchPolicy, lineChannel, lineIdentity } from "@app/db/schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "../../src/crypto.ts";
import { withTx } from "../../src/db.ts";
import { createFakeLineSender, createLineSender } from "../../src/integrations/line/index.ts";
import { dispatchQueued } from "../../src/notify/dispatch.ts";
import { enqueueNotification } from "../../src/notify/enqueue.ts";
import type { NotificationPayloads, TemplateKey } from "../../src/notify/keys.ts";
import type { LineSender, NotifyDeps } from "../../src/notify/senders.ts";
import { FLEX_BUTTON_LABEL, flexMessage, renderTemplate, withFlex } from "../../src/notify/templates/index.ts";
import { seedOrg, setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

const URL = "https://petbooking.test/liff/shop-a/bookings/b1";
const confirmed = { bookingNo: "B-1", summary: "โมจิ: อาบน้ำ", dateTime: "5 ต.ค. 10:00", shopName: "Shop", bookingUrl: URL };

describe("render", () => {
  it("a customer template with a url → Flex: the text in the body, a uri button to the url, altText = first line", () => {
    const r = withFlex("customer.booking_confirmed", renderTemplate("customer.booking_confirmed", confirmed));
    expect(r.url).toBe(URL);
    expect(r.flex).toEqual({
      type: "flex",
      altText: "ยืนยันการจอง B-1 ✅",
      contents: {
        type: "bubble",
        body: { type: "box", layout: "vertical", contents: [{ type: "text", text: r.text, wrap: true }] },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [{ type: "button", style: "primary", action: { type: "uri", label: FLEX_BUTTON_LABEL, uri: URL } }],
        },
      },
    });
    expect([...FLEX_BUTTON_LABEL].length).toBeLessThanOrEqual(20);
  });

  it("no url → text only; staff messages (Web Push / email) never get a Flex", () => {
    const linked = withFlex("customer.link_approved", renderTemplate("customer.link_approved", { shopName: "Shop" }));
    expect(linked.flex).toBeUndefined();
    expect(linked.text).toContain("เชื่อมบัญชี LINE");
    const staff = withFlex("staff.new_booking", { text: "x", url: URL });
    expect(staff).toEqual({ text: "x", url: URL });
  });

  it("altText skips leading empty lines and stays within LINE's 400 characters", () => {
    expect(flexMessage("\n  \nบรรทัดแรก\nบรรทัดสอง", URL).altText).toBe("บรรทัดแรก");
    expect([...flexMessage("ก".repeat(500), URL).altText]).toHaveLength(400);
  });
});

describe("LINE senders", () => {
  const KEY = randomBytes(32).toString("base64");
  const channel = {
    id: "c1",
    organizationId: "o1",
    branchId: "b1",
    providerId: "p1",
    messagingChannelId: "m1",
    channelSecretEnc: encryptSecret("secret", KEY),
    channelAccessTokenEnc: encryptSecret("access-token", KEY),
    loginChannelId: "l1",
    liffId: "l1-x",
    botBasicId: null,
    monthlyPushQuota: 300,
    status: "active" as const,
    lastVerifiedAt: null,
    lastErrorAt: null,
    lastError: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  } as unknown as Parameters<LineSender["send"]>[0]["lineChannel"];
  const flex = flexMessage("ยืนยันการจอง B-1 ✅\nโมจิ", URL);

  it("the Messaging API sender pushes / replies the Flex when given, else the text", async () => {
    const client = { pushMessage: vi.fn().mockResolvedValue({}), replyMessage: vi.fn().mockResolvedValue({}) };
    const sender = createLineSender({ createClient: () => client, encryptionKey: KEY });
    await sender.send({ lineChannel: channel, lineUserId: "U1", text: "x", flex });
    await sender.send({ lineChannel: channel, lineUserId: "U1", text: "x", flex, replyToken: "r1" });
    await sender.send({ lineChannel: channel, lineUserId: "U1", text: "สวัสดี" });
    expect(client.pushMessage).toHaveBeenNthCalledWith(1, { to: "U1", messages: [flex] });
    expect(client.replyMessage).toHaveBeenCalledWith({ replyToken: "r1", messages: [flex] });
    expect(client.pushMessage).toHaveBeenNthCalledWith(2, { to: "U1", messages: [{ type: "text", text: "สวัสดี" }] });
  });

  it("the fake sender keeps the Flex in its outbox", async () => {
    const fake = createFakeLineSender();
    await fake.send({ lineChannel: channel, lineUserId: "U1", text: "x", flex });
    await fake.send({ lineChannel: channel, lineUserId: "U1", text: "y" });
    expect(fake.outbox).toEqual([
      { messagingChannelId: "m1", lineUserId: "U1", text: "x", flex },
      { messagingChannelId: "m1", lineUserId: "U1", text: "y" },
    ]);
  });
});

describe("dispatch", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setupTestDb();
  });
  afterAll(() => env.close());

  it("hands the Flex to the LINE sender for a customer template with a url, plain text otherwise", async () => {
    const s = await seedOrg(env.db, "flex1");
    await env.db.insert(lineChannel).values({
      organizationId: s.orgId,
      branchId: s.branchId,
      providerId: "prov-flex1",
      messagingChannelId: "msg-flex1",
      channelSecretEnc: "x",
      channelAccessTokenEnc: "x",
      loginChannelId: "login-flex1",
      liffId: "liff-flex1",
      status: "active",
    });
    await env.db.insert(branchPolicy).values({ branchId: s.branchId, economyMode: false });
    await env.db
      .insert(lineIdentity)
      .values({ providerId: "prov-flex1", lineUserId: "U-flex1", ownerProfileId: s.ownerProfileId, isFriend: true });
    const enqueue = <K extends TemplateKey>(key: K, payload: NotificationPayloads[K]) => {
      const ctx = staffCtx(s, "owner");
      return withTx(ctx, (tx) =>
        enqueueNotification(tx, ctx, {
          key,
          recipient: { type: "customer", id: s.customerId },
          payload,
          dedupeKey: `${key}:${randomUUID()}`,
        }),
      );
    };
    await enqueue("customer.booking_confirmed", confirmed);
    await enqueue("customer.link_approved", { shopName: "Shop" });
    const fake = createFakeLineSender();
    const deps: NotifyDeps = { line: fake, webPush: { send: async () => ({ ok: true }) }, email: { send: async () => {} } };
    await dispatchQueued(deps, { now: TEST_NOW });
    const mine = fake.outbox.filter((m) => m.lineUserId === "U-flex1");
    expect(mine).toHaveLength(2);
    expect(mine.find((m) => m.text.startsWith("ยืนยันการจอง"))?.flex).toMatchObject({ altText: "ยืนยันการจอง B-1 ✅" });
    expect(mine.find((m) => m.text.includes("เชื่อมบัญชี LINE"))).not.toHaveProperty("flex");
  });
});
