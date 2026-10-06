// Reply tokens from incoming webhook messages, kept in memory for 50 s (R-19 step 2, SP-03).
// Keyed by OA + LINE user; a token is single-use, so `take` removes it.

const MAX_AGE_SECONDS = 50;

type Entry = { token: string; receivedAt: number };

export function createReplyTokenStore() {
  const entries = new Map<string, Entry>();
  const key = (messagingChannelId: string, lineUserId: string) => `${messagingChannelId}:${lineUserId}`;
  return {
    put(input: { messagingChannelId: string; lineUserId: string; token: string; now: Date }) {
      entries.set(key(input.messagingChannelId, input.lineUserId), { token: input.token, receivedAt: input.now.getTime() });
    },
    /** age in seconds of a still-usable token (for R-19 `replyTokenAgeSeconds`), else null */
    ageSeconds(input: { messagingChannelId: string; lineUserId: string; now: Date }): number | null {
      const entry = entries.get(key(input.messagingChannelId, input.lineUserId));
      if (!entry) return null;
      const age = (input.now.getTime() - entry.receivedAt) / 1000;
      return age < MAX_AGE_SECONDS ? age : null;
    },
    take(input: { messagingChannelId: string; lineUserId: string; now: Date }): string | null {
      const k = key(input.messagingChannelId, input.lineUserId);
      const age = this.ageSeconds(input);
      const entry = entries.get(k);
      entries.delete(k);
      return age === null || !entry ? null : entry.token;
    },
  };
}

export type ReplyTokenStore = ReturnType<typeof createReplyTokenStore>;
