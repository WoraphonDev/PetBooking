// LIFF sign-in (01 §4, Q-1030): liff.init with ShopPublic.liffId → ID token → liff.session (cid cookie for this branch).
// LINE_FAKE=1 (dev/E2E only) skips the SDK and sends a fake token `fake:<userId>:<name>` that the server accepts.

import { LiffSessionResponse } from "@app/contracts/endpoints/liff.session";
import { api } from "./api";

export const FAKE_USER_PARAM = "fakeUser";
const FAKE_DEFAULT_USER = "Udevcustomer";
const FAKE_NAME = "ลูกค้าทดสอบ";

/** ID token for liff.session, or null while LIFF redirects to LINE Login (the page reloads after it). */
export async function liffIdToken(input: { liffId: string; fake: boolean; href: string }): Promise<string | null> {
  if (input.fake) {
    const user = new URL(input.href).searchParams.get(FAKE_USER_PARAM) || FAKE_DEFAULT_USER;
    return `fake:${user}:${FAKE_NAME}`;
  }
  const { default: liff } = await import("@line/liff");
  await liff.init({ liffId: input.liffId });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: input.href });
    return null;
  }
  return liff.getIDToken();
}

/** Opens a customer session for the branch; null while LINE Login takes over the page. */
export async function liffSignIn(input: { branchSlug: string; liffId: string; fake: boolean; href: string }) {
  const idToken = await liffIdToken(input);
  if (!idToken) return null;
  return api("liff.session", { params: { branchSlug: input.branchSlug }, body: { idToken }, response: LiffSessionResponse });
}
