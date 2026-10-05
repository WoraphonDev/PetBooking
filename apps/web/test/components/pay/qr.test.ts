import { promptPayPayload } from "@app/domain/payment/promptpay";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { encodeQr, qrPath, versionFor } from "../../../src/components/shared/pay/index.ts";

/** draws the modules (4-module quiet zone, `scale` px each) and reads them back with jsQR */
function decode(modules: boolean[][], scale = 4): string | null {
  const size = (modules.length + 8) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const [y, row] of modules.entries())
    for (const [x, dark] of row.entries()) {
      if (!dark) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    }
  return jsQR(pixels, size, size)?.data ?? null;
}

describe("encodeQr", () => {
  it.each([
    ["short", "HELLO"],
    ["v3 boundary", "x".repeat(42)],
    ["v6", "y".repeat(100)],
    ["v7 (version info)", "z".repeat(130)],
    ["v10 (16-bit count, mixed blocks)", "w".repeat(200)],
    ["thai utf-8", "ร้านหมาน้อย 123"],
  ])("round-trips %s through jsQR", (_name, text) => {
    expect(decode(encodeQr(text))).toBe(text);
  });

  it("round-trips a real R-30 PromptPay payload", () => {
    const result = promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 25_500 });
    if (!("payload" in result)) throw new Error(result.error);
    const { payload } = result;
    const modules = encodeQr(payload);
    expect(decode(modules)).toBe(payload);
    expect(modules.length).toBe(17 + 4 * versionFor(new TextEncoder().encode(payload).length));
  });

  it("picks the smallest version and rejects payloads beyond version 10", () => {
    expect([versionFor(1), versionFor(14), versionFor(15), versionFor(213)]).toEqual([1, 1, 2, 10]);
    expect(() => versionFor(214)).toThrow(RangeError);
  });

  it("renders one SVG square per dark module, offset by the quiet zone", () => {
    expect(
      qrPath([
        [true, false],
        [false, true],
      ]),
    ).toBe("M4 4h1v1h-1zM5 5h1v1h-1z");
  });
});
