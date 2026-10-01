import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/health/route.ts";

describe("GET /api/health", () => {
  it("returns ok with db placeholder and app version", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.2.3";
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "unknown", version: "1.2.3" });
  });
});
