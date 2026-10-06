import type { lineChannel } from "@app/db/schema";
import { HTTPFetchError, messagingApi } from "@line/bot-sdk";
import { decryptSecret } from "../../crypto.ts";
import type { LineSender } from "../../notify/senders.ts";

type Channel = typeof lineChannel.$inferSelect;
type Client = Pick<messagingApi.MessagingApiClient, "pushMessage" | "replyMessage">;

const ATTEMPTS = 3;

/**
 * Messaging API sender (01 §7). The access token is decrypted per send and never logged.
 * Retries only 5xx (3 attempts); 401 → `onUnauthorized` (caller sets line_channel.status = error).
 */
export function createLineSender(
  options: {
    createClient?: (channelAccessToken: string) => Client;
    onUnauthorized?: (channel: Channel) => Promise<void>;
    encryptionKey?: string;
  } = {},
) {
  const createClient = options.createClient ?? ((channelAccessToken) => new messagingApi.MessagingApiClient({ channelAccessToken }));
  return {
    async send(input) {
      const client = createClient(decryptSecret(input.lineChannel.channelAccessTokenEnc, options.encryptionKey));
      const messages = [{ type: "text" as const, text: input.text }];
      for (let attempt = 1; ; attempt++) {
        try {
          if (input.replyToken) await client.replyMessage({ replyToken: input.replyToken, messages });
          else await client.pushMessage({ to: input.lineUserId, messages });
          return;
        } catch (error) {
          const status = error instanceof HTTPFetchError ? error.status : null;
          if (status !== null && status >= 500 && attempt < ATTEMPTS) continue;
          if (status === 401) await options.onUnauthorized?.(input.lineChannel);
          // The dispatcher persists this message: no token, user id or response body.
          throw new Error(status ? `LINE delivery failed (${status})` : "LINE delivery failed");
        }
      }
    },
  } satisfies LineSender;
}
