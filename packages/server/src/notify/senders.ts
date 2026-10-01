// Delivery adapters (01 §2 integrations). Real LINE / Web Push (VAPID) / SMTP implementations live in the integration tasks;
// tests use fakes. Adapters throw on failure — the dispatcher records `failed` with the error message.
import type { lineChannel } from "@app/db/schema";

export type LineSender = {
  /** push (or reply when `replyToken` is given) a text message from the branch's OA */
  send(input: { lineChannel: typeof lineChannel.$inferSelect; lineUserId: string; text: string; replyToken?: string }): Promise<void>;
};

export type WebPushSubscriptionTarget = { id: string; endpoint: string; p256dh: string; auth: string };
export type WebPushSender = {
  /** `gone` = the push service answered 404/410 → the subscription gets `disabled_at` */
  send(input: { subscription: WebPushSubscriptionTarget; text: string }): Promise<{ ok: true } | { gone: true }>;
};

export type EmailSender = {
  send(input: { to: string; text: string }): Promise<void>;
};

export type NotifyDeps = { line: LineSender; webPush: WebPushSender; email: EmailSender };
