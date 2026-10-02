import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { notification, staffUser, webPushSubscription } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createWebPushSender } from "../../src/integrations/webpush/index.ts";
import { dispatchQueued } from "../../src/notify/dispatch.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(() => env.close());
const vapid = { subject: "mailto:push@example.test", publicKey: "public", privateKey: "private" };

it("supplies VAPID details, endpoint keys and a JSON notification URL to the transport", async () => {
  const send = vi.fn().mockResolvedValue({});
  const sender = createWebPushSender({ vapid, send });
  expect(
    await sender.send({
      subscription: { id: "s", endpoint: "https://push.test/one", p256dh: "key", auth: "auth" },
      text: "แจ้งเตือน",
      url: "/staff/care",
    }),
  ).toEqual({ ok: true });
  expect(send).toHaveBeenCalledWith(
    { endpoint: "https://push.test/one", keys: { p256dh: "key", auth: "auth" } },
    JSON.stringify({ text: "แจ้งเตือน", url: "/staff/care" }),
    { vapidDetails: vapid },
  );
});

it("dispatches to every active staff device and disables 404/410 endpoints with ctx.now", async () => {
  const staffId = env.base.staff.owner;
  await env.db.update(staffUser).set({ email: null }).where(eq(staffUser.id, staffId));
  await env.db.insert(webPushSubscription).values(
    [200, 404, 410].map((status) => ({
      organizationId: env.base.orgId,
      staffUserId: staffId,
      endpoint: `https://push.test/${status}`,
      p256dh: "key",
      auth: "auth",
    })),
  );
  const send = vi.fn(async (input: { endpoint: string }) => {
    const statusCode = Number(input.endpoint.split("/").at(-1));
    if (statusCode !== 200) throw { statusCode };
    return { statusCode: 201, body: "", headers: {} };
  });
  await env.db.insert(notification).values({
    organizationId: env.base.orgId,
    branchId: env.base.branchId,
    recipientType: "staff",
    recipientId: staffId,
    templateKey: "staff.care_task_overdue",
    channel: "web_push",
    payload: { roomName: "A", taskName: "Care", dueTime: "10:00" },
    dedupeKey: "webpush:all",
    monthKey: "2026-10",
  });
  await dispatchQueued(
    { line: { send: async () => {} }, email: { send: async () => {} }, webPush: createWebPushSender({ vapid, send }) },
    { now: TEST_NOW },
  );
  expect(send).toHaveBeenCalledTimes(3);
  const subscriptions = await env.db.select().from(webPushSubscription);
  expect(subscriptions.find((s) => s.endpoint.endsWith("200"))?.lastSuccessAt).toEqual(TEST_NOW);
  expect(subscriptions.filter((s) => s.disabledAt !== null)).toHaveLength(2);
  for (const s of subscriptions.filter((s) => s.disabledAt !== null)) expect(s.disabledAt).toEqual(TEST_NOW);
  expect((await env.db.select().from(notification))[0]?.status).toBe("sent");
});

it("redacts transport errors and never treats temporary failures as expired subscriptions", async () => {
  const sender = createWebPushSender({ vapid, send: vi.fn().mockRejectedValue(new Error("secret-private-key")) });
  await expect(
    sender.send({ subscription: { id: "s", endpoint: "https://push.test/one", p256dh: "key", auth: "auth" }, text: "test" }),
  ).rejects.toThrow("Web Push delivery failed");
});

it("shows push text and opens the payload URL when a notification is clicked", async () => {
  const events: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(await readFile(new URL("../../../../apps/web/public/sw.js", import.meta.url), "utf8"), {
    URL,
    self: {
      addEventListener: (name: string, cb: (event: unknown) => void) => {
        events[name] = cb;
      },
      location: { origin: "https://petbooking.test" },
      registration: { showNotification },
      clients: { openWindow },
    },
  });
  let pending: Promise<unknown> = Promise.resolve();
  events.push?.({
    data: { json: () => ({ text: "Care", url: "/staff/care" }) },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  expect(showNotification).toHaveBeenCalledWith("PJ-8 Staff", { body: "Care", data: { url: "https://petbooking.test/staff/care" } });
  const close = vi.fn();
  events.notificationclick?.({
    notification: { close, data: { url: "https://petbooking.test/staff/care" } },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  expect(close).toHaveBeenCalled();
  expect(openWindow).toHaveBeenCalledWith("https://petbooking.test/staff/care");
  const manifest = JSON.parse(await readFile(new URL("../../../../apps/web/public/manifest.webmanifest", import.meta.url), "utf8"));
  expect(manifest).toMatchObject({ name: "PJ-8 Staff", start_url: "/staff", display: "standalone" });
});

it("asks permission, subscribes using the public key and posts exactly the specified API fields", async () => {
  const api = vi.fn().mockResolvedValue(undefined);
  const subscription = { toJSON: () => ({ endpoint: "https://push.test/device", keys: { p256dh: "p256", auth: "auth" } }) };
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const getSubscription = vi.fn().mockResolvedValue(null);
  const register = vi.fn().mockResolvedValue(undefined);
  const requestPermission = vi.fn().mockResolvedValue("denied");
  const source = (await readFile(new URL("../../../../apps/web/src/lib/push.ts", import.meta.url), "utf8"))
    .replace(/^import .*;$/m, "const api = globalThis.api;")
    .replace("export async function", "async function");
  const run = runInNewContext(`${stripTypeScriptTypes(source)}; subscribeStaffPush`, {
    api,
    atob,
    Notification: { requestPermission },
    PushManager: {},
    navigator: {
      serviceWorker: {
        register,
        ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
      },
    },
  }) as (key: string) => Promise<unknown>;
  expect(await run("AQID")).toBeNull();
  expect(register).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalled();
  requestPermission.mockResolvedValue("granted");
  expect(await run("AQID")).toBe(subscription);
  expect(register).toHaveBeenCalledWith("/sw.js");
  expect(Array.from(new Uint8Array(subscribe.mock.calls[0]?.[0].applicationServerKey))).toEqual([1, 2, 3]);
  expect(api).toHaveBeenCalledWith("staffMe.pushSubscribe", {
    body: { endpoint: "https://push.test/device", p256dh: "p256", auth: "auth" },
  });
  getSubscription.mockResolvedValue(subscription);
  await run("AQID");
  expect(subscribe).toHaveBeenCalledTimes(1);
});
