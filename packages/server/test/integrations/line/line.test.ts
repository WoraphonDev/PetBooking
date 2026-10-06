import { createHmac, randomBytes } from "node:crypto";
import type { lineChannel } from "@app/db/schema";
import { HTTPFetchError } from "@line/bot-sdk";
import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "../../../src/crypto.ts";
import {
  createFakeLineSender,
  createLineSender,
  createReplyTokenStore,
  lineFakeEnabled,
  verifyLineIdToken,
  verifyLineSignature,
} from "../../../src/integrations/line/index.ts";

const KEY = randomBytes(32).toString("base64");
const NOW = new Date("2026-10-06T03:00:00.000Z");

function channel(): typeof lineChannel.$inferSelect {
  return {
    id: "c1",
    organizationId: "o1",
    branchId: "b1",
    providerId: "p1",
    messagingChannelId: "2011875979",
    channelSecretEnc: encryptSecret("secret", KEY),
    channelAccessTokenEnc: encryptSecret("access-token", KEY),
    loginChannelId: "2011876637",
    liffId: "2011876637-x",
    botBasicId: null,
    monthlyPushQuota: 300,
    richMenuId: null,
    webhookVerifiedAt: null,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function httpError(status: number) {
  return new HTTPFetchError("fail", { status, statusText: "x", headers: new Headers(), body: "token=access-token" });
}

describe("crypto", () => {
  it("round-trips with a fresh iv per value in v1:iv:tag:cipher form", () => {
    const a = encryptSecret("ความลับ", KEY);
    const b = encryptSecret("ความลับ", KEY);
    expect(a).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe("ความลับ");
  });

  it("rejects a tampered value, a wrong key and a bad key length", () => {
    const enc = encryptSecret("x", KEY);
    const parts = enc.split(":");
    parts[3] = Buffer.from("y").toString("base64");
    expect(() => decryptSecret(parts.join(":"), KEY)).toThrow("Decryption failed");
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow("Decryption failed");
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow("32 bytes");
  });
});

describe("signature", () => {
  const body = '{"events":[]}';
  const sig = createHmac("sha256", "secret").update(body).digest("base64");
  it("accepts the HMAC-SHA256 base64 signature", () => {
    expect(verifyLineSignature({ channelSecret: "secret", rawBody: body, signature: sig })).toBe(true);
  });
  it("rejects a wrong, missing or malformed signature", () => {
    expect(verifyLineSignature({ channelSecret: "other", rawBody: body, signature: sig })).toBe(false);
    expect(verifyLineSignature({ channelSecret: "secret", rawBody: body, signature: null })).toBe(false);
    expect(verifyLineSignature({ channelSecret: "secret", rawBody: body, signature: "abc" })).toBe(false);
  });
});

describe("messaging", () => {
  it("pushes with the decrypted token, or replies when a reply token is given", async () => {
    const client = { pushMessage: vi.fn().mockResolvedValue({}), replyMessage: vi.fn().mockResolvedValue({}) };
    const createClient = vi.fn().mockReturnValue(client);
    const sender = createLineSender({ createClient, encryptionKey: KEY });
    await sender.send({ lineChannel: channel(), lineUserId: "U1", text: "สวัสดี" });
    await sender.send({ lineChannel: channel(), lineUserId: "U1", text: "ตอบ", replyToken: "r1" });
    expect(createClient).toHaveBeenCalledWith("access-token");
    expect(client.pushMessage).toHaveBeenCalledWith({ to: "U1", messages: [{ type: "text", text: "สวัสดี" }] });
    expect(client.replyMessage).toHaveBeenCalledWith({ replyToken: "r1", messages: [{ type: "text", text: "ตอบ" }] });
  });

  it("retries 5xx up to 3 attempts", async () => {
    const pushMessage = vi.fn().mockRejectedValueOnce(httpError(500)).mockRejectedValueOnce(httpError(503)).mockResolvedValue({});
    const sender = createLineSender({ createClient: () => ({ pushMessage, replyMessage: vi.fn() }), encryptionKey: KEY });
    await sender.send({ lineChannel: channel(), lineUserId: "U1", text: "x" });
    expect(pushMessage).toHaveBeenCalledTimes(3);

    const failing = vi.fn().mockRejectedValue(httpError(502));
    const s2 = createLineSender({ createClient: () => ({ pushMessage: failing, replyMessage: vi.fn() }), encryptionKey: KEY });
    await expect(s2.send({ lineChannel: channel(), lineUserId: "U1", text: "x" })).rejects.toThrow("LINE delivery failed (502)");
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it("does not retry 4xx; 401 calls onUnauthorized; the error carries no token or body", async () => {
    const pushMessage = vi.fn().mockRejectedValue(httpError(401));
    const onUnauthorized = vi.fn().mockResolvedValue(undefined);
    const sender = createLineSender({ createClient: () => ({ pushMessage, replyMessage: vi.fn() }), onUnauthorized, encryptionKey: KEY });
    const err = await sender.send({ lineChannel: channel(), lineUserId: "U1", text: "x" }).catch((e: Error) => e);
    expect(pushMessage).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(String(err)).not.toMatch(/access-token|U1/);

    const p400 = vi.fn().mockRejectedValue(httpError(400));
    const s2 = createLineSender({ createClient: () => ({ pushMessage: p400, replyMessage: vi.fn() }), onUnauthorized, encryptionKey: KEY });
    await expect(s2.send({ lineChannel: channel(), lineUserId: "U1", text: "x" })).rejects.toThrow("(400)");
    expect(p400).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("ID token", () => {
  const ok = (body: object, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("posts id_token + client_id and returns sub/name/picture", async () => {
    const f = ok({ sub: "U1", aud: "2011876637", name: "Luna", picture: "https://p" });
    expect(await verifyLineIdToken({ idToken: "t", loginChannelId: "2011876637" }, { fetch: f, fake: false })).toEqual({
      sub: "U1",
      name: "Luna",
      picture: "https://p",
    });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(String(init.body)).toBe("id_token=t&client_id=2011876637");
  });

  it("returns null for a rejected token or another channel's token; throws when LINE is down", async () => {
    expect(
      await verifyLineIdToken({ idToken: "t", loginChannelId: "1" }, { fetch: ok({ error: "invalid" }, 400), fake: false }),
    ).toBeNull();
    expect(await verifyLineIdToken({ idToken: "t", loginChannelId: "1" }, { fetch: ok({ sub: "U1", aud: "2" }), fake: false })).toBeNull();
    await expect(verifyLineIdToken({ idToken: "t", loginChannelId: "1" }, { fetch: ok({}, 503), fake: false })).rejects.toThrow(
      "unavailable",
    );
  });

  it("fake mode parses fake:<userId>:<name> without calling LINE", async () => {
    const f = vi.fn();
    expect(await verifyLineIdToken({ idToken: "fake:U9:มะลิ", loginChannelId: "1" }, { fetch: f, fake: true })).toEqual({
      sub: "U9",
      name: "มะลิ",
      picture: null,
    });
    expect(await verifyLineIdToken({ idToken: "real-token", loginChannelId: "1" }, { fetch: f, fake: true })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("fake mode", () => {
  it("is refused in production", () => {
    expect(lineFakeEnabled({ LINE_FAKE: "1", NODE_ENV: "development" })).toBe(true);
    expect(lineFakeEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(() => lineFakeEnabled({ LINE_FAKE: "1", NODE_ENV: "production" })).toThrow("not allowed in production");
  });

  it("keeps sent messages in memory", async () => {
    const sender = createFakeLineSender();
    await sender.send({ lineChannel: channel(), lineUserId: "U1", text: "hi", replyToken: "r" });
    expect(sender.outbox).toEqual([{ messagingChannelId: "2011875979", lineUserId: "U1", text: "hi", replyToken: "r" }]);
  });
});

describe("reply token store", () => {
  it("serves a token younger than 50 s once", () => {
    const store = createReplyTokenStore();
    const at = (s: number) => new Date(NOW.getTime() + s * 1000);
    store.put({ messagingChannelId: "m", lineUserId: "U1", token: "r1", now: NOW });
    expect(store.ageSeconds({ messagingChannelId: "m", lineUserId: "U1", now: at(10) })).toBe(10);
    expect(store.ageSeconds({ messagingChannelId: "m", lineUserId: "U2", now: at(10) })).toBeNull();
    expect(store.take({ messagingChannelId: "m", lineUserId: "U1", now: at(10) })).toBe("r1");
    expect(store.take({ messagingChannelId: "m", lineUserId: "U1", now: at(11) })).toBeNull();
    store.put({ messagingChannelId: "m", lineUserId: "U1", token: "r2", now: NOW });
    expect(store.take({ messagingChannelId: "m", lineUserId: "U1", now: at(50) })).toBeNull();
  });
});
