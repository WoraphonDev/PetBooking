import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSystemCtx } from "../../../src/context.ts";
import { setDb } from "../../../src/db.ts";
import { logRequest } from "../../../src/log.ts";
import { health, healthGet } from "../../../src/services/health/health.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv | undefined;
const info = vi.fn();
const stdout = vi.fn();
const ctx = makeSystemCtx(null, TEST_NOW);

beforeEach(() => {
  info.mockReset();
  stdout.mockClear();
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout(chunk.toString());
    return true;
  });
  vi.spyOn(console, "info").mockImplementation(info);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  if (env) await env.close();
  env = undefined;
  setDb(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("health service", () => {
  it("adapts real database success and failure to HTTP 200 and 503", async () => {
    env = await setupTestDb();
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", undefined);
    const request = new Request("https://petbooking.test/api/health");
    const healthy = await healthGet(request);
    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toEqual({ ok: true, db: "ok", version: "dev" });
    await env.t.pg.close();
    const unavailable = await healthGet(request);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ ok: false, db: "error", version: "dev" });
    expect(console.error).not.toHaveBeenCalled();
    env = undefined;
    setDb(null);
  });
  it("pings real PostgreSQL through PGlite and preserves the release version", async () => {
    env = await setupTestDb();
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    expect(await health(ctx)).toEqual({ ok: true, db: "ok", version: "1.2.3" });
    const record = JSON.parse(info.mock.calls[0]?.[0]);
    expect(record).toEqual({ requestId: ctx.requestId, orgId: null, key: "health", ms: expect.any(Number), status: 200 });
    expect(record.ms).toBeGreaterThanOrEqual(0);
  });

  it("returns the failure contract when the database connection is closed", async () => {
    env = await setupTestDb();
    await env.t.pg.close();
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", undefined);
    expect(await health(ctx)).toEqual({ ok: false, db: "error", version: "dev" });
    expect(JSON.parse(stdout.mock.calls[0]?.[0]).status).toBe(503);
    env = undefined;
    setDb(null); // the connection was already closed above
  });

  it("returns a sanitized failure when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", undefined);
    expect(await health(ctx)).toEqual({ ok: false, db: "error", version: "dev" });
    const output = stdout.mock.calls[0]?.[0];
    expect(output).not.toContain("DATABASE_URL");
    expect(JSON.parse(output).status).toBe(503);
    expect(console.error).not.toHaveBeenCalled();
  });
});

it("logs only approved fields even when callers pass extra sensitive properties", () => {
  const entry = {
    requestId: ctx.requestId,
    orgId: null,
    key: "health",
    ms: 1,
    status: 200,
    password: "secret-password",
    body: { token: "secret-token" },
    cookie: "sid=secret",
  };
  logRequest(entry);
  expect(JSON.parse(info.mock.calls[0]?.[0])).toEqual({
    requestId: ctx.requestId,
    orgId: null,
    key: "health",
    ms: 1,
    status: 200,
  });
});
