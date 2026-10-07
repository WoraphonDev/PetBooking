import type { LineSender } from "../../notify/senders.ts";
import type { FlexMessage } from "../../notify/templates/index.ts";

export type FakeLineMessage = { messagingChannelId: string; lineUserId: string; text: string; flex?: FlexMessage; replyToken?: string };

/** LINE_FAKE=1 is for dev/E2E only (01 §6): refuse to start in production. */
export function lineFakeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const fake = env.LINE_FAKE === "1";
  if (fake && env.NODE_ENV === "production") throw new Error("LINE_FAKE=1 is not allowed in production");
  return fake;
}

/** In-memory sender: messages land in `outbox`, nothing leaves the process. */
export function createFakeLineSender() {
  const outbox: FakeLineMessage[] = [];
  return {
    outbox,
    async send(input) {
      outbox.push({
        messagingChannelId: input.lineChannel.messagingChannelId,
        lineUserId: input.lineUserId,
        text: input.text,
        ...(input.flex ? { flex: input.flex } : {}),
        ...(input.replyToken ? { replyToken: input.replyToken } : {}),
      });
    },
  } satisfies LineSender & { outbox: FakeLineMessage[] };
}
