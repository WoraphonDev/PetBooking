import type { LineSender } from "../../notify/senders.ts";
import { createFakeLineSender, lineFakeEnabled } from "./fake.ts";
import { createLineSender } from "./messaging.ts";

export { createFakeLineSender, lineFakeEnabled } from "./fake.ts";
export { type LineIdTokenProfile, verifyLineIdToken } from "./idtoken.ts";
export { createLineSender } from "./messaging.ts";
export { createReplyTokenStore, type ReplyTokenStore } from "./reply-tokens.ts";
export { verifyLineSignature } from "./signature.ts";

/** Real sender, or the in-memory fake when LINE_FAKE=1 (throws in production). */
export function createLineSenderFromEnv(options: Parameters<typeof createLineSender>[0] = {}): LineSender {
  return lineFakeEnabled() ? createFakeLineSender() : createLineSender(options);
}
