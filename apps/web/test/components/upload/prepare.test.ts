import { describe, expect, it, vi } from "vitest";
import { fitWithin, type ImageCodec, prepareFile, qualitySteps, TARGET_BYTES } from "../../../src/components/shared/upload/index.ts";

const blobOf = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });

/** fake codec: decoded size is fixed, encoded size = bytesFor(type, quality) */
function fakeCodec(width: number, height: number, bytesFor: (type: string, quality: number) => { size: number; type: string }) {
  const close = vi.fn();
  const codec: ImageCodec = {
    decode: vi.fn(async () => ({ width, height, close })),
    encode: vi.fn(async (_img, _size, type, quality) => {
      const out = bytesFor(type, quality);
      return blobOf(out.size, out.type);
    }),
  };
  return { codec, close };
}

describe("fitWithin (R-25 longest side 1600 px)", () => {
  it("scales a landscape photo so the long side is 1600", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });
  it("scales a portrait photo by its height", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("never upscales a small photo", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it("keeps at least 1 px on a very thin image", () => {
    expect(fitWithin(10000, 2)).toEqual({ width: 1600, height: 1 });
  });
});

describe("qualitySteps", () => {
  it("starts at 0.8 and steps down to 0.5", () => {
    expect(qualitySteps()).toEqual([0.8, 0.7, 0.6, 0.5]);
  });
});

describe("prepareFile", () => {
  it("re-encodes a photo as WebP 0.8 at the fitted size (drops EXIF) and closes the bitmap", async () => {
    const { codec, close } = fakeCodec(4032, 3024, (type) => ({ size: 400_000, type }));
    const out = await prepareFile(blobOf(3_000_000, "image/jpeg"), codec);
    expect(out).toMatchObject({ mimeType: "image/webp", width: 1600, height: 1200 });
    expect(out.blob.size).toBe(400_000);
    expect(codec.encode).toHaveBeenCalledTimes(1);
    expect(codec.encode).toHaveBeenCalledWith(expect.anything(), { width: 1600, height: 1200 }, "image/webp", 0.8, false);
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back to opaque JPEG when the browser cannot encode WebP", async () => {
    const { codec } = fakeCodec(2000, 1000, (type) => ({ size: 300_000, type: type === "image/webp" ? "image/png" : type }));
    const out = await prepareFile(blobOf(1_000_000, "image/png"), codec);
    expect(out.mimeType).toBe("image/jpeg");
    expect(codec.encode).toHaveBeenLastCalledWith(expect.anything(), { width: 1600, height: 800 }, "image/jpeg", 0.8, true);
  });

  it("lowers the quality while above the 1.5 MB target", async () => {
    const sizes: Record<number, number> = { 0.8: 2_100_000, 0.7: 1_700_000, 0.6: 1_200_000 };
    const { codec } = fakeCodec(1600, 1200, (type, q) => ({ size: sizes[q] ?? 900_000, type }));
    const out = await prepareFile(blobOf(5_000_000, "image/jpeg"), codec);
    expect(out.blob.size).toBe(1_200_000);
    expect(out.blob.size).toBeLessThanOrEqual(TARGET_BYTES);
    expect(codec.encode).toHaveBeenCalledTimes(3);
  });

  it("stops at quality 0.5 and returns the last encode even if still above target", async () => {
    const { codec } = fakeCodec(1600, 1200, (type) => ({ size: 1_800_000, type }));
    const out = await prepareFile(blobOf(5_000_000, "image/jpeg"), codec);
    expect(out.blob.size).toBe(1_800_000);
    expect(codec.encode).toHaveBeenCalledTimes(4);
  });

  it("passes a PDF through untouched", async () => {
    const { codec } = fakeCodec(1, 1, (type) => ({ size: 1, type }));
    const pdf = blobOf(3_000_000, "application/pdf");
    const out = await prepareFile(pdf, codec);
    expect(out).toEqual({ blob: pdf, mimeType: "application/pdf" });
    expect(codec.decode).not.toHaveBeenCalled();
  });
});
