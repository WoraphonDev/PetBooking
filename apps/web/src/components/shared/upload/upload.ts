// R-25 upload flow: prepare → validateUpload → `*.uploadUrl` ticket → presigned PUT with progress.
// The returned fileId is committed later by the endpoint that references it (05#ep-staff.uploadUrl).

import type { UploadTicket } from "@app/contracts/dto/upload-ticket";
import { CustomerUploadUrlResponse } from "@app/contracts/endpoints/customer.uploadUrl";
import { type StaffUploadUrlRequest, StaffUploadUrlResponse } from "@app/contracts/endpoints/staff.uploadUrl";
import type { FileKind } from "@app/contracts/enums";
import { ERROR_MESSAGE_TH, type ErrorCode } from "@app/contracts/errors";
import { validateUpload } from "@app/domain/files/upload-policy";
import { ApiClientError, api } from "../../../lib/api.ts";
import { type ImageCodec, type PreparedFile, prepareFile } from "./prepare.ts";

/** Same body for staff.uploadUrl and customer.uploadUrl. */
export type UploadTicketRequest = StaffUploadUrlRequest;
export type RequestTicket = (request: UploadTicketRequest) => Promise<UploadTicket>;

/** staff.uploadUrl (console / staff PWA) */
export const staffTicket: RequestTicket = (body) => api("staff.uploadUrl", { body, response: StaffUploadUrlResponse });

/** customer.uploadUrl (LIFF) */
export const customerTicket =
  (branchSlug: string): RequestTicket =>
  (body) =>
    api("customer.uploadUrl", { params: { branchSlug }, body, response: CustomerUploadUrlResponse });

export type PutFile = (ticket: UploadTicket, blob: Blob, onProgress: (fraction: number) => void) => Promise<void>;

/** Presigned PUT through XMLHttpRequest (fetch has no upload progress). Any non-2xx → FILE_NOT_UPLOADED. */
export const xhrPut: PutFile = (ticket, blob, onProgress) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else reject(uploadError("FILE_NOT_UPLOADED"));
    };
    xhr.onerror = () => reject(uploadError("FILE_NOT_UPLOADED"));
    xhr.onabort = () => reject(uploadError("FILE_NOT_UPLOADED"));
    xhr.send(blob);
  });

export class UploadError extends Error {
  override readonly name = "UploadError";
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const uploadError = (code: ErrorCode) => new UploadError(code, ERROR_MESSAGE_TH[code]);

/** Thai message for any error from uploadOne (validation, API or PUT). */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof UploadError || err instanceof ApiClientError) return err.message;
  return ERROR_MESSAGE_TH.FILE_NOT_UPLOADED;
}

/** R-25 server table checked on the client too, so an oversized/unsupported file fails before any request. */
export function checkUpload(kind: FileKind, prepared: Pick<PreparedFile, "mimeType" | "blob">): void {
  const result = validateUpload({ kind, mimeType: prepared.mimeType, sizeBytes: prepared.blob.size });
  if (!result.ok) throw uploadError(result.error as ErrorCode);
}

export type UploadDeps = { requestTicket: RequestTicket; put?: PutFile; codec?: ImageCodec };
export type UploadStage = "preparing" | "uploading";

/** Uploads one file; resolves the new fileId. */
export async function uploadOne(
  kind: FileKind,
  file: Blob,
  deps: UploadDeps,
  onProgress: (stage: UploadStage, fraction: number) => void = () => {},
): Promise<{ fileId: string; blob: Blob }> {
  onProgress("preparing", 0);
  let prepared: PreparedFile;
  try {
    prepared = await prepareFile(file, deps.codec);
  } catch {
    // undecodable image (e.g. a format the browser cannot read)
    throw uploadError("UPLOAD_TYPE_NOT_ALLOWED");
  }
  checkUpload(kind, prepared);
  const ticket = await deps.requestTicket({
    kind,
    mimeType: prepared.mimeType,
    sizeBytes: prepared.blob.size,
    width: prepared.width,
    height: prepared.height,
  });
  onProgress("uploading", 0);
  await (deps.put ?? xhrPut)(ticket, prepared.blob, (fraction) => onProgress("uploading", fraction));
  return { fileId: ticket.fileId, blob: prepared.blob };
}
