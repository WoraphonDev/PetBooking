import { lineFakeEnabled } from "./fake.ts";

export type LineIdTokenProfile = { sub: string; name: string | null; picture: string | null };

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

/** fake token `fake:<userId>:<name>` (LINE_FAKE=1 only) */
function parseFake(idToken: string): LineIdTokenProfile | null {
  const match = /^fake:([^:]+):(.*)$/.exec(idToken);
  if (!match?.[1]) return null;
  return { sub: match[1], name: match[2] || null, picture: null };
}

/**
 * Verify a LIFF ID token with LINE (client_id = line_channel.login_channel_id).
 * Returns null for an invalid/expired token or a token issued to another channel; throws only when LINE is unreachable.
 */
export async function verifyLineIdToken(
  input: { idToken: string; loginChannelId: string },
  options: { fetch?: typeof fetch; fake?: boolean } = {},
): Promise<LineIdTokenProfile | null> {
  if (options.fake ?? lineFakeEnabled()) return parseFake(input.idToken);
  const res = await (options.fetch ?? fetch)(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: input.idToken, client_id: input.loginChannelId }).toString(),
  });
  if (res.status >= 500) throw new Error("LINE ID token verification unavailable");
  if (!res.ok) return null;
  const body = (await res.json()) as { sub?: unknown; aud?: unknown; name?: unknown; picture?: unknown };
  if (typeof body.sub !== "string" || body.aud !== input.loginChannelId) return null;
  return {
    sub: body.sub,
    name: typeof body.name === "string" ? body.name : null,
    picture: typeof body.picture === "string" ? body.picture : null,
  };
}
