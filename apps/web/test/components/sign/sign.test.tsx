import type { UploadTicket } from "@app/contracts/dto/upload-ticket";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  type Ctx,
  drawStrokes,
  inkLength,
  isEmpty,
  SignaturePad,
  toLocal,
  uploadSignature,
} from "../../../src/components/shared/sign/index.ts";
import common from "../../../src/i18n/messages/th/common.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (common as Record<string, string>)[key],
}));

const ticket: UploadTicket = {
  fileId: "30000000-0000-4000-8000-000000000007",
  uploadUrl: "https://s.test/put",
  headers: {},
  storageKey: "k",
};
const png = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/png" });
const labels = { area: "ช่องเซ็นชื่อ", clear: "ล้าง", confirm: "ยืนยันลายเซ็น", uploading: "กำลังอัปโหลด", signed: "เซ็นแล้ว" };

function recorder() {
  const calls: string[] = [];
  const ctx = {
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    strokeStyle: "",
    fillStyle: "",
    setTransform: (...a: number[]) => calls.push(`setTransform(${a.join(",")})`),
    clearRect: () => calls.push("clearRect"),
    fillRect: (...a: number[]) => calls.push(`fillRect(${a.join(",")})`),
    beginPath: () => calls.push("beginPath"),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    stroke: () => calls.push("stroke"),
  } as unknown as Ctx;
  return { ctx, calls };
}

describe("strokes", () => {
  it("knows an empty pad and measures ink", () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([[]])).toBe(true);
    expect(isEmpty([[{ x: 1, y: 1 }]])).toBe(false);
    expect(
      inkLength([
        [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ],
        [{ x: 9, y: 9 }],
      ]),
    ).toBe(5);
  });

  it("maps pointer coordinates into the pad and clamps at its edges", () => {
    const rect = { left: 10, top: 20, width: 300, height: 150 };
    expect(toLocal(60, 70, rect)).toEqual({ x: 50, y: 50 });
    expect(toLocal(0, 500, rect)).toEqual({ x: 0, y: 150 });
  });

  it("draws a white background, then each stroke (a tap becomes a dot) at device scale", () => {
    const { ctx, calls } = recorder();
    drawStrokes(
      ctx,
      [
        [
          { x: 1, y: 2 },
          { x: 5, y: 6 },
        ],
        [{ x: 7, y: 8 }],
        [],
      ],
      { width: 300, height: 150 },
      2,
    );
    expect(calls).toEqual([
      "setTransform(2,0,0,2,0,0)",
      "clearRect",
      "fillRect(0,0,300,150)",
      "beginPath",
      "moveTo(1,2)",
      "lineTo(5,6)",
      "stroke",
      "beginPath",
      "moveTo(7,8)",
      "lineTo(7.01,8.01)",
      "stroke",
    ]);
    expect(ctx).toMatchObject({ fillStyle: "#fff", lineCap: "round", lineJoin: "round" });
  });
});

describe("uploadSignature", () => {
  it("uploads the PNG unchanged as kind signature with the pad size and returns the fileId", async () => {
    const requestTicket = vi.fn(async () => ticket);
    const put = vi.fn(async () => {});
    const blob = png(20_000);
    await expect(uploadSignature(blob, { width: 320.4, height: 180 }, { requestTicket, put })).resolves.toBe(ticket.fileId);
    expect(requestTicket).toHaveBeenCalledWith({ kind: "signature", mimeType: "image/png", sizeBytes: 20_000, width: 320, height: 180 });
    expect(put).toHaveBeenCalledWith(ticket, blob, expect.any(Function));
  });

  it("refuses a signature over 500 KB before asking for a ticket (R-25)", async () => {
    const requestTicket = vi.fn(async () => ticket);
    await expect(uploadSignature(png(500_001), { width: 300, height: 150 }, { requestTicket })).rejects.toThrow(
      ERROR_MESSAGE_TH.UPLOAD_TOO_LARGE,
    );
    expect(requestTicket).not.toHaveBeenCalled();
  });
});

describe("SignaturePad", () => {
  it("renders the labelled pad with clear / confirm disabled while empty", () => {
    const html = renderToStaticMarkup(<SignaturePad requestTicket={vi.fn()} labels={labels} onChange={vi.fn()} />);
    expect(html).toContain('aria-label="ช่องเซ็นชื่อ"');
    expect(html).toContain("touch-none");
    expect(html).toMatch(/disabled=""[^>]*>ล้าง/);
    expect(html).toMatch(/disabled=""[^>]*>ยืนยันลายเซ็น/);
  });
});
