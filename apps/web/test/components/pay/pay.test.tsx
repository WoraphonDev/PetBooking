import type { UploadTicket } from "@app/contracts/dto/upload-ticket";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  Countdown,
  encodeQr,
  formatCountdown,
  type Pixels,
  PromptPayQR,
  readQr,
  remainingMs,
  SlipUploader,
  uploadSlip,
} from "../../../src/components/shared/pay/index.ts";
import type { ImageCodec } from "../../../src/components/shared/upload/index.ts";
import common from "../../../src/i18n/messages/th/common.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (common as Record<string, string>)[key],
}));

/** QR modules → RGBA pixels with a quiet zone */
function pixelsOf(modules: boolean[][], scale = 4): Pixels {
  const size = (modules.length + 8) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const [y, row] of modules.entries())
    for (const [x, dark] of row.entries()) {
      if (!dark) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { data, width: size, height: size };
}

const SLIP_QR = "004600060000010103014022000111222233334444555566665102TH9104ABCD";
const ticket: UploadTicket = {
  fileId: "30000000-0000-4000-8000-000000000009",
  uploadUrl: "https://s.test/put",
  headers: {},
  storageKey: "k",
};
const codec: ImageCodec = {
  decode: async () => ({ width: 800, height: 1600 }),
  encode: async () => new Blob([new Uint8Array(300_000)], { type: "image/webp" }),
};
const slipFile = () => new Blob([new Uint8Array(10)], { type: "image/jpeg" });

describe("Countdown", () => {
  it("formats the time left", () => {
    expect(remainingMs("2026-10-05T03:15:00.000Z", Date.parse("2026-10-05T03:00:00.000Z"))).toBe(900_000);
    expect(remainingMs("2026-10-05T03:00:00.000Z", Date.parse("2026-10-05T03:00:05.000Z"))).toBe(0);
    expect([formatCountdown(900_000), formatCountdown(61_500), formatCountdown(500), formatCountdown(3_725_000)]).toEqual([
      "15:00",
      "1:02",
      "0:01",
      "1:02:05",
    ]);
  });

  it("renders a timer, and the expired label once past", () => {
    const future = new Date(Date.now() + 90_000).toISOString();
    expect(renderToStaticMarkup(<Countdown expiresAt={future} expiredLabel="หมดเวลา" />)).toMatch(/role="timer"[^>]*>1:(29|30)</);
    expect(renderToStaticMarkup(<Countdown expiresAt="2000-01-01T00:00:00.000Z" expiredLabel="หมดเวลา" />)).toContain("หมดเวลา");
  });
});

describe("PromptPayQR", () => {
  it("renders the payload as an accessible SVG QR with a quiet zone", () => {
    const payload = "00020101021229370016A000000677010111011300668123456785303764540625.005802TH6304ABCD";
    const html = renderToStaticMarkup(<PromptPayQR payload={payload} label="QR พร้อมเพย์" size={200} />);
    const n = encodeQr(payload).length + 8;
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QR พร้อมเพย์"');
    expect(html).toContain(`viewBox="0 0 ${n} ${n}"`);
    expect(html).toContain('width="200"');
  });
});

describe("slip QR (R-05)", () => {
  it("reads the QR text from slip pixels, null when there is none", () => {
    expect(readQr(pixelsOf(encodeQr(SLIP_QR)))).toBe(SLIP_QR);
    expect(readQr({ data: new Uint8ClampedArray(40 * 40 * 4).fill(255), width: 40, height: 40 })).toBeNull();
  });

  it("uploads the slip as kind slip and returns the fileId with the QR payload", async () => {
    const requestTicket = vi.fn(async () => ticket);
    const put = vi.fn(async () => {});
    const slip = await uploadSlip(slipFile(), { requestTicket, put, codec, pixels: async () => pixelsOf(encodeQr(SLIP_QR)) });
    expect(slip).toEqual({ fileId: ticket.fileId, qrPayload: SLIP_QR });
    expect(requestTicket).toHaveBeenCalledWith(expect.objectContaining({ kind: "slip", mimeType: "image/webp" }));
  });

  it("still uploads with qrPayload null when the image cannot be read", async () => {
    const slip = await uploadSlip(slipFile(), {
      requestTicket: async () => ticket,
      put: async () => {},
      codec,
      pixels: async () => Promise.reject(new Error("decode")),
    });
    expect(slip.qrPayload).toBeNull();
  });

  it("fails with the R-25 message when the slip is too large after resizing", async () => {
    const big: ImageCodec = { ...codec, encode: async () => new Blob([new Uint8Array(2_500_000)], { type: "image/webp" }) };
    await expect(uploadSlip(slipFile(), { requestTicket: vi.fn(), codec: big, pixels: async () => pixelsOf([[false]]) })).rejects.toThrow(
      ERROR_MESSAGE_TH.UPLOAD_TOO_LARGE,
    );
  });
});

describe("SlipUploader", () => {
  it("renders the pick button with the screen's label and an image-only file input", () => {
    const html = renderToStaticMarkup(
      <SlipUploader requestTicket={vi.fn()} labels={{ pick: "แนบสลิป", uploading: "กำลังอัปโหลด" }} onUploaded={vi.fn()} />,
    );
    expect(html).toContain("แนบสลิป");
    expect(html).toContain('accept="image/*"');
    expect(html).not.toContain("multiple");
  });
});
