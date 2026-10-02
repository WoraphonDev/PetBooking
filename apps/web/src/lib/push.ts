"use client";

import { api } from "./api.ts";

/** Called from a user gesture. The screen supplies the public VAPID key; private keys stay on the server. */
export async function subscribeStaffPush(publicKey: string): Promise<PushSubscription | null> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in globalThis) ||
    !("Notification" in globalThis)
  )
    return null;
  if ((await Notification.requestPermission()) !== "granted") return null;
  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  const base64 = publicKey.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const applicationServerKey = Uint8Array.from(decoded, (c) => c.charCodeAt(0)).buffer;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Invalid Web Push subscription");
  await api("staffMe.pushSubscribe", { body: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return subscription;
}
