import { readFileSync } from "node:fs";
import { MutationObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClientError, api, buildUrl, ENDPOINTS, errorMessage } from "../src/lib/api.ts";
import { apiQueryKey, createQueryClient, invalidateEndpoints } from "../src/lib/query.ts";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

type Entry = { key: string; method: string; path: string; auth: string };
const catalog: Entry[] = JSON.parse(readFileSync(new URL("../../../docs/spec/vectors/endpoints.json", import.meta.url), "utf8")).endpoints;

const fetchMock = vi.fn<typeof fetch>();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  toastError.mockReset();
});

describe("ENDPOINTS ⇄ docs/spec/vectors/endpoints.json", () => {
  it("has every browser-callable endpoint with the same method and path (webhook/cron excluded)", () => {
    const expected = Object.fromEntries(
      catalog.filter((e) => e.auth !== "line" && e.auth !== "cron").map((e) => [e.key, [e.method, e.path]]),
    );
    expect(ENDPOINTS).toEqual(expected);
    expect(Object.keys(ENDPOINTS)).toEqual(Object.keys(expected));
  });
});

describe("buildUrl", () => {
  it("fills and encodes path params and drops empty query values", () => {
    expect(buildUrl("staffUsers.update", { staffUserId: "a/b" }, { x: 1, y: null, z: undefined, w: false })).toBe(
      "/api/v1/staff/staff-users/a%2Fb?x=1&w=false",
    );
  });

  it("throws when a path param is missing", () => {
    expect(() => buildUrl("staffUsers.update")).toThrow('missing path param "staffUserId"');
  });
});

describe("api()", () => {
  it("GET: same-origin cookies, no body, returns JSON", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "s1" }));
    await expect(api("auth.me")).resolves.toEqual({ id: "s1" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/auth/staff/me");
    expect(init).toMatchObject({ method: "GET", credentials: "same-origin", body: undefined });
  });

  it("POST: sends JSON body with content-type", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await api("auth.staffLogin", { body: { email: "a@b.co", password: "x" } });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"email":"a@b.co","password":"x"}');
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("204 → undefined", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api("auth.staffLogout")).resolves.toBeUndefined();
  });

  it("error body → ApiClientError with code, Thai message, status, details", async () => {
    fetchMock.mockResolvedValue(json(409, { error: { code: "SLOT_TAKEN", message: "คิวนี้เพิ่งถูกจองไป กรุณาเลือกเวลาใหม่", details: { a: 1 } } }));
    const err = await api("bookings.create", { body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: "SLOT_TAKEN", status: 409, message: "คิวนี้เพิ่งถูกจองไป กรุณาเลือกเวลาใหม่", details: { a: 1 } });
  });

  it("non-JSON error / network failure → INTERNAL", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    await expect(api("auth.me")).rejects.toMatchObject({ code: "INTERNAL", status: 502, message: "ระบบขัดข้อง กรุณาลองใหม่" });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api("auth.me")).rejects.toMatchObject({ code: "INTERNAL", status: 0 });
  });

  it("validates the response against the contract outside production only", async () => {
    const response = z.object({ id: z.string() });
    fetchMock.mockImplementation(async () => json(200, { id: 1 }));
    await expect(api("auth.me", { response })).rejects.toThrow("response does not match contract");
    vi.stubEnv("NODE_ENV", "production");
    await expect(api("auth.me", { response })).resolves.toEqual({ id: 1 });
  });

  it("errorMessage: Thai message for ApiClientError, INTERNAL otherwise", () => {
    expect(errorMessage(new ApiClientError("NOT_FOUND", "ไม่พบข้อมูล", 404))).toBe("ไม่พบข้อมูล");
    expect(errorMessage(new Error("boom"))).toBe("ระบบขัดข้อง กรุณาลองใหม่");
  });
});

describe("query client", () => {
  const forbidden = () => Promise.reject(new ApiClientError("FORBIDDEN", "คุณไม่มีสิทธิ์ทำรายการนี้", 403));

  it("failed query → toast with the server message", async () => {
    const client = createQueryClient();
    await client.fetchQuery({ queryKey: ["auth.me"], queryFn: forbidden }).catch(() => {});
    expect(toastError).toHaveBeenCalledWith("คุณไม่มีสิทธิ์ทำรายการนี้");
  });

  it("meta.toast = false suppresses the toast", async () => {
    const client = createQueryClient();
    await client.fetchQuery({ queryKey: ["auth.me"], queryFn: forbidden, meta: { toast: false } }).catch(() => {});
    expect(toastError).not.toHaveBeenCalled();
  });

  it("failed mutation → toast", async () => {
    const client = createQueryClient();
    await new MutationObserver(client, { mutationFn: forbidden }).mutate().catch(() => {});
    expect(toastError).toHaveBeenCalledWith("คุณไม่มีสิทธิ์ทำรายการนี้");
  });

  it("apiQueryKey + invalidateEndpoints invalidate every variant of an endpoint only", async () => {
    const client = createQueryClient();
    const a = apiQueryKey("customers.list", { query: { q: "a" } });
    const b = apiQueryKey("customers.list", { query: { q: "b" } });
    const other = apiQueryKey("auth.me");
    for (const k of [a, b, other]) client.setQueryData(k, 1);
    await invalidateEndpoints(client, ["customers.list"]);
    expect(client.getQueryState(a)?.isInvalidated).toBe(true);
    expect(client.getQueryState(b)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
