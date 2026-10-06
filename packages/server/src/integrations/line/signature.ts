import { createHmac, timingSafeEqual } from "node:crypto";

/** `x-line-signature` = base64(HMAC-SHA256(channelSecret, raw body)) — 01 §7; compare in constant time. */
export function verifyLineSignature(input: { channelSecret: string; rawBody: string | Uint8Array; signature: string | null }): boolean {
  if (!input.signature) return false;
  const expected = createHmac("sha256", input.channelSecret).update(input.rawBody).digest();
  const given = Buffer.from(input.signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
