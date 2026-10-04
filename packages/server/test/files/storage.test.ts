import { afterEach, expect, it, vi } from "vitest";
import { createS3Storage, GET_TTL_SECONDS, PUT_TTL_SECONDS } from "../../src/integrations/storage/index.ts";

// Presigning is local (SigV4) — no network call is made here.
const s3 = () =>
  createS3Storage({
    endpoint: "https://acc.r2.example.test",
    region: "auto",
    bucket: "petbooking",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  });
afterEach(() => vi.unstubAllEnvs());

it("presigns a 5-minute PUT that signs Content-Type and Content-Length", async () => {
  const url = new URL(await s3().presignPut({ key: "org/o1/slip/2026/10/f1.jpg", contentType: "image/jpeg", sizeBytes: 1234 }));
  expect(url.origin + url.pathname).toBe("https://acc.r2.example.test/petbooking/org/o1/slip/2026/10/f1.jpg");
  expect(url.searchParams.get("X-Amz-Expires")).toBe(String(PUT_TTL_SECONDS));
  expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
    expect.arrayContaining(["content-length", "content-type", "host"]),
  );
  expect(url.toString()).not.toContain("test-secret-key");
});

it("presigns a 1-hour GET", async () => {
  const url = new URL(await s3().presignGet("org/o1/before/2026/10/f2.webp"));
  expect(url.pathname).toBe("/petbooking/org/o1/before/2026/10/f2.webp");
  expect(url.searchParams.get("X-Amz-Expires")).toBe(String(GET_TTL_SECONDS));
});

it("reads S3_* from env and refuses to start without bucket credentials", async () => {
  vi.stubEnv("S3_ENDPOINT", "https://env.example.test");
  vi.stubEnv("S3_BUCKET", "env-bucket");
  vi.stubEnv("S3_ACCESS_KEY_ID", "id");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
  expect(new URL(await createS3Storage().presignGet("k")).toString()).toMatch(/^https:\/\/env\.example\.test\/env-bucket\/k\?/);
  vi.stubEnv("S3_BUCKET", "");
  expect(() => createS3Storage()).toThrow("Object storage configuration missing");
});
