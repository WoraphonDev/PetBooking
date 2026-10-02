import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/health/route.ts";

const { health } = vi.hoisted(() => ({ health: vi.fn() }));
vi.mock("@app/server/services/health/health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/server/services/health/health")>();
  return { ...actual, healthGet: actual.withHealth(health) };
});

describe("GET /api/health", () => {
  beforeEach(() => {
    health.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("returns the healthy service payload with HTTP 200", async () => {
    health.mockResolvedValue({ ok: true, db: "ok", version: "1.2.3" });
    const response = await GET(new Request("https://petbooking.test/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, db: "ok", version: "1.2.3" });
    expect(health).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: null, actor: { type: "system", id: null }, now: expect.any(Date), requestId: expect.any(String) }),
    );
    expect(response.headers.get("content-type")).toContain("application/json");
  });
  it("preserves the sanitized service failure payload and returns HTTP 503", async () => {
    health.mockResolvedValue({ ok: false, db: "error", version: "dev" });
    const response = await GET(new Request("https://petbooking.test/api/health"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, db: "error", version: "dev" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
