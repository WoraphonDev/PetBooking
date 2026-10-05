// Signature upload: the PNG goes to storage as kind `signature` (R-25: image/png ≤ 500 KB). It is NOT re-encoded like
// photos (shared/upload converts to WebP, which `signature` does not accept).
import { checkUpload, type PutFile, type RequestTicket, xhrPut } from "../upload/index.ts";

export const SIGNATURE_MIME = "image/png";

export type SignatureDeps = { requestTicket: RequestTicket; put?: PutFile };

/** R-25 check → ticket (with the pad size) → presigned PUT; resolves the fileId for consent / agreement endpoints */
export async function uploadSignature(
  png: Blob,
  size: { width: number; height: number },
  deps: SignatureDeps,
  onProgress: (fraction: number) => void = () => {},
): Promise<string> {
  checkUpload("signature", { mimeType: SIGNATURE_MIME, blob: png });
  const ticket = await deps.requestTicket({
    kind: "signature",
    mimeType: SIGNATURE_MIME,
    sizeBytes: png.size,
    width: Math.round(size.width),
    height: Math.round(size.height),
  });
  await (deps.put ?? xhrPut)(ticket, png, onProgress);
  return ticket.fileId;
}
