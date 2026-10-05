// R-05 step 1: the client reads the mini-QR on a bank slip and sends its text as `qrPayload` with the upload
// (null when unreadable). The decoder is injectable so the flow is testable without a browser.
import jsQR from "jsqr";
import { type UploadDeps, uploadOne } from "../upload/index.ts";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
/** longest side used for decoding — slips are phone screenshots; smaller images decode faster and still keep the QR */
export const DECODE_MAX_SIDE = 1600;

/** text of the first QR code in the pixels, or null */
export function readQr(pixels: Pixels): string | null {
  return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" })?.data || null;
}

/** browser: image file → RGBA pixels (EXIF orientation applied) */
export async function filePixels(file: Blob): Promise<Pixels> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, DECODE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const [width, height] = [Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale))];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    bitmap.close();
  }
}

export type SlipDeps = UploadDeps & { pixels?: (file: Blob) => Promise<Pixels> };
export type UploadedSlip = { fileId: string; qrPayload: string | null };

/** reads the slip QR (failures → null, never blocks the upload), then uploads the slip as kind `slip` (R-25) */
export async function uploadSlip(file: Blob, deps: SlipDeps, onProgress?: Parameters<typeof uploadOne>[3]): Promise<UploadedSlip> {
  let qrPayload: string | null = null;
  try {
    qrPayload = readQr(await (deps.pixels ?? filePixels)(file));
  } catch {
    qrPayload = null;
  }
  const { fileId } = await uploadOne("slip", file, deps, onProgress);
  return { fileId, qrPayload };
}
