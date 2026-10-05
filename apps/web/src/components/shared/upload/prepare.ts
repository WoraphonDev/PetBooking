// R-25 step 1 — client-side photo preparation before the presigned PUT:
// longest side ≤ 1600 px, re-encoded as WebP (JPEG where the browser cannot encode WebP) at quality 0.8.
// Re-encoding through a canvas keeps only pixels, so EXIF (incl. GPS) never leaves the device.

export const MAX_SIDE_PX = 1600;
export const QUALITY = 0.8;
/** R-25 target after resizing; the server limit (2 MB for photos) is checked by validateUpload */
export const TARGET_BYTES = 1_500_000;
const MIN_QUALITY = 0.5;

/** Size that fits `maxSide` on the longest side, keeping the aspect ratio; never upscales. */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Lower quality steps tried while the encoded photo is still above TARGET_BYTES. */
export function qualitySteps(): number[] {
  const steps: number[] = [];
  for (let q = QUALITY; q >= MIN_QUALITY - 1e-9; q -= 0.1) steps.push(Math.round(q * 10) / 10);
  return steps;
}

export function isImage(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

export type PreparedFile = { blob: Blob; mimeType: string; width?: number; height?: number };

/** Decoded pixels + an encoder; injected so the pipeline is testable without a browser. */
export type ImageCodec = {
  decode(file: Blob): Promise<{ width: number; height: number; close?: () => void }>;
  /** draws the decoded image at (width, height) and encodes it; `opaque` paints a white background first (JPEG) */
  encode(
    image: { width: number; height: number },
    size: { width: number; height: number },
    type: string,
    quality: number,
    opaque: boolean,
  ): Promise<Blob>;
};

/** Images are resized + re-encoded; other files (PDF for vaccine_proof) pass through unchanged. */
export async function prepareFile(file: Blob, codec: ImageCodec = browserCodec): Promise<PreparedFile> {
  if (!isImage(file.type)) return { blob: file, mimeType: file.type };
  const image = await codec.decode(file);
  try {
    const size = fitWithin(image.width, image.height);
    let blob: Blob | undefined;
    for (const quality of qualitySteps()) {
      blob = await codec.encode(image, size, "image/webp", quality, false);
      // Safari cannot encode WebP and silently returns PNG → fall back to JPEG
      if (blob.type !== "image/webp") blob = await codec.encode(image, size, "image/jpeg", quality, true);
      if (blob.size <= TARGET_BYTES) break;
    }
    const out = blob as Blob;
    return { blob: out, mimeType: out.type, ...size };
  } finally {
    image.close?.();
  }
}

/** Browser codec: createImageBitmap applies the EXIF orientation, the canvas drops the metadata. */
export const browserCodec: ImageCodec = {
  decode: (file) => createImageBitmap(file, { imageOrientation: "from-image" }),
  async encode(image, size, type, quality, opaque) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    if (opaque) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(image as CanvasImageSource, 0, 0, size.width, size.height);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas encode failed"))), type, quality),
    );
  },
};
