// R-19 — pick the delivery channel (04#R-19): customers only via the shop's LINE OA, staff via Web Push (email fallback for owners only).

/** a reply token is used only while younger than this (SP-03) */
const REPLY_TOKEN_MAX_AGE_SECONDS = 50;

export function selectChannel(input: {
  recipientType: "customer" | "staff";
  hasLineIdentity: boolean;
  isFriend: boolean;
  templateAllowsReply: boolean;
  replyTokenAgeSeconds: number | null;
  activePushSubscriptions: number;
  isOwner: boolean;
  hasEmail: boolean;
}): { channel: "line_reply" | "line_push" | "web_push" | "email" | null; skipReason: "no_recipient" | null } {
  if (input.recipientType === "customer") {
    // 1. no LINE identity or not a friend of the OA → nothing can reach them
    if (!input.hasLineIdentity || !input.isFriend) return { channel: null, skipReason: "no_recipient" };
    // 2. fresh reply token + template allows reply → free reply
    const age = input.replyTokenAgeSeconds;
    if (input.templateAllowsReply && age !== null && age < REPLY_TOKEN_MAX_AGE_SECONDS) return { channel: "line_reply", skipReason: null };
    // 3. otherwise push (quota decided by R-18)
    return { channel: "line_push", skipReason: null };
  }

  // 4. staff: any active device → web_push (all devices); else owner with email → email; else skip
  if (input.activePushSubscriptions > 0) return { channel: "web_push", skipReason: null };
  if (input.isOwner && input.hasEmail) return { channel: "email", skipReason: null };
  return { channel: null, skipReason: "no_recipient" };
}
