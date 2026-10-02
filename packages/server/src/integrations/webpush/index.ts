import webPush from "web-push";
import type { WebPushSender } from "../../notify/senders.ts";

type Vapid = { subject: string; publicKey: string; privateKey: string };
export function createWebPushSender(options: { vapid?: Vapid; send?: typeof webPush.sendNotification } = {}) {
  const transport = options.send ?? webPush.sendNotification;
  return {
    async send(input: Parameters<WebPushSender["send"]>[0] & { url?: string }): Promise<{ ok: true } | { gone: true }> {
      const vapid = options.vapid ?? {
        subject: process.env.VAPID_SUBJECT ?? "",
        publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
        privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
      };
      if (!vapid.subject || !vapid.publicKey || !vapid.privateKey) throw new Error("Web Push VAPID configuration missing");
      try {
        await transport(
          { endpoint: input.subscription.endpoint, keys: { p256dh: input.subscription.p256dh, auth: input.subscription.auth } },
          JSON.stringify({ text: input.text, url: input.url ?? "/staff" }),
          { vapidDetails: vapid },
        );
        return { ok: true };
      } catch (error) {
        const status = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : null;
        if (status === 404 || status === 410) return { gone: true };
        // The dispatcher persists this error: never expose key material or endpoint credentials.
        throw new Error("Web Push delivery failed");
      }
    },
  } satisfies WebPushSender;
}
