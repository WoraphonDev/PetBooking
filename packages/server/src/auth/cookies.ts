// Session cookies (01 §4): HttpOnly, Secure (except dev), SameSite=Lax, Path=/. Framework-agnostic shape (fits Next `cookies().set`).
import type { SessionSubject } from "@app/contracts/enums";

export const SESSION_COOKIE: Record<SessionSubject, string> = { staff: "sid", customer: "cid", platform_admin: "aid" };

export type CookieSpec = {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; expires: Date };
};

const options = (expires: Date): CookieSpec["options"] => ({
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  sameSite: "lax",
  path: "/",
  expires,
});

export function sessionCookie(subjectType: SessionSubject, token: string, expiresAt: Date): CookieSpec {
  return { name: SESSION_COOKIE[subjectType], value: token, options: options(expiresAt) };
}

/** Expires the cookie immediately (logout / revoked session). */
export function clearSessionCookie(subjectType: SessionSubject): CookieSpec {
  return { name: SESSION_COOKIE[subjectType], value: "", options: options(new Date(0)) };
}
