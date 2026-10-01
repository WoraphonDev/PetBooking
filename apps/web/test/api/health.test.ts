import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/health/route.ts";

describe("GET /api/health", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
  });

  it("returns ok with db placeholder and app version", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.2.3";
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "unknown", version: "1.2.3" });
  });

  it("falls back to version 'dev' when NEXT_PUBLIC_APP_VERSION is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    expect(await GET().json()).toEqual({ ok: true, db: "unknown", version: "dev" });
  });
});
