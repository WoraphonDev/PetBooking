// 01 §4 step 9: JSON success response / error JSON `{error:{code,message,details}}` with the 05 §1 HTTP status.
import { ERROR_HTTP, ERROR_MESSAGE_TH } from "@app/contracts/errors";
import type { CookieSpec } from "../auth/cookies.ts";
import { AppError, mapPgError } from "../errors.ts";

/** `undefined` (endpoints documented as 204) → 204 without body, otherwise 200 JSON. */
export function jsonResponse(result: unknown, cookies: CookieSpec[]): Response {
  const headers = new Headers();
  for (const c of cookies) headers.append("set-cookie", serializeCookie(c));
  if (result === undefined) return new Response(null, { status: 204, headers });
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(result), { status: 200, headers });
}

export function errorResponse(e: unknown, requestId: string): Response {
  const err = e instanceof AppError ? e : mapPgError(e);
  if (err.code === "INTERNAL") {
    // never log request bodies, cookies or tokens (01 §10) — only the id and the error itself
    console.error(`[http] INTERNAL requestId=${requestId}`, err.cause ?? err);
  }
  const body = { error: { code: err.code, message: ERROR_MESSAGE_TH[err.code], details: err.details ?? {} } };
  return new Response(JSON.stringify(body), {
    status: ERROR_HTTP[err.code],
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function serializeCookie({ name, value, options }: CookieSpec): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Expires=${options.expires.toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
