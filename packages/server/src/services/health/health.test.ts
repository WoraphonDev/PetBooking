import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, TEST_NOW, type TestEnv } from "../../../test/helpers/setup.ts";
import { makeSystemCtx } from "../../context.ts";
import { setDb } from "../../db.ts";
import { logRequest } from "../../log.ts";
import { health } from "./health.ts";

let env: TestEnv | undefined;
const info = vi.fn();
const ctx = makeSystemCtx(null, TEST_NOW);

beforeEach(() => {
  info.mockReset();
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
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0]?.[0]).status).toBe(503);
    env = undefined;
    setDb(null); // the connection was already closed above
  });

  it("returns a sanitized failure when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", undefined);
    expect(await health(ctx)).toEqual({ ok: false, db: "error", version: "dev" });
    const output = vi.mocked(console.error).mock.calls[0]?.[0];
    expect(output).not.toContain("DATABASE_URL");
    expect(JSON.parse(output).status).toBe(503);
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
