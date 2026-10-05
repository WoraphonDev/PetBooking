import type { UploadTicket } from "@app/contracts/dto/upload-ticket";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkUpload,
  customerTicket,
  type ImageCodec,
  type PutFile,
  staffTicket,
  UploadError,
  uploadErrorMessage,
  uploadOne,
  xhrPut,
} from "../../../src/components/shared/upload/index.ts";
import { ApiClientError } from "../../../src/lib/api.ts";

const FILE_ID = "30000000-0000-4000-8000-000000000001";
const ticket: UploadTicket = {
  fileId: FILE_ID,
  uploadUrl: "https://storage.test/put?sig=1",
  headers: { "Content-Type": "image/webp" },
  storageKey: "org/o/after/2026/10/x.webp",
};
const blobOf = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });
const codec = (size: number, type = "image/webp"): ImageCodec => ({
  decode: async () => ({ width: 3200, height: 2400 }),
  encode: async () => blobOf(size, type),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkUpload (R-25 on the client)", () => {
  it("accepts a resized photo", () => {
    expect(() => checkUpload("after", { mimeType: "image/webp", blob: blobOf(850_000, "image/webp") })).not.toThrow();
  });
  it("rejects a photo over 2 MB with the Thai UPLOAD_TOO_LARGE message", () => {
    const run = () => checkUpload("after", { mimeType: "image/jpeg", blob: blobOf(2_500_000, "image/jpeg") });
    expect(run).toThrow(UploadError);
    expect(run).toThrow(ERROR_MESSAGE_TH.UPLOAD_TOO_LARGE);
  });
  it("rejects a PDF for a slip", () => {
    expect(() => checkUpload("slip", { mimeType: "application/pdf", blob: blobOf(1000, "application/pdf") })).toThrow(
      ERROR_MESSAGE_TH.UPLOAD_TYPE_NOT_ALLOWED,
    );
  });
  it("accepts a PDF vaccine proof up to 5 MB", () => {
    expect(() => checkUpload("vaccine_proof", { mimeType: "application/pdf", blob: blobOf(3_000_000, "application/pdf") })).not.toThrow();
  });
});

describe("uploadOne", () => {
  it("prepares, asks for a ticket with the prepared size, PUTs with progress and returns the fileId", async () => {
    const requestTicket = vi.fn(async () => ticket);
    const put = vi.fn<PutFile>(async (_t, _b, onProgress) => {
      onProgress(0.5);
      onProgress(1);
    });
    const progress = vi.fn();
    const out = await uploadOne("after", blobOf(4_000_000, "image/jpeg"), { requestTicket, put, codec: codec(700_000) }, progress);
    expect(out.fileId).toBe(FILE_ID);
    expect(requestTicket).toHaveBeenCalledWith({ kind: "after", mimeType: "image/webp", sizeBytes: 700_000, width: 1600, height: 1200 });
    expect(put).toHaveBeenCalledWith(ticket, out.blob, expect.any(Function));
    expect(progress.mock.calls).toEqual([
      ["preparing", 0],
      ["uploading", 0],
      ["uploading", 0.5],
      ["uploading", 1],
    ]);
  });

  it("does not request a ticket when R-25 fails", async () => {
    const requestTicket = vi.fn(async () => ticket);
    await expect(
      uploadOne("signature", blobOf(10_000, "image/jpeg"), { requestTicket, put: vi.fn(), codec: codec(9_000) }),
    ).rejects.toThrow(ERROR_MESSAGE_TH.UPLOAD_TYPE_NOT_ALLOWED);
    expect(requestTicket).not.toHaveBeenCalled();
  });

  it("maps an undecodable image to UPLOAD_TYPE_NOT_ALLOWED", async () => {
    const broken: ImageCodec = { decode: async () => Promise.reject(new Error("bad")), encode: vi.fn() };
    await expect(uploadOne("after", blobOf(10, "image/heic"), { requestTicket: vi.fn(), codec: broken })).rejects.toMatchObject({
      code: "UPLOAD_TYPE_NOT_ALLOWED",
    });
  });

  it("propagates the API error from the ticket request", async () => {
    const apiErr = new ApiClientError("UPLOAD_TOO_LARGE", ERROR_MESSAGE_TH.UPLOAD_TOO_LARGE, 422);
    await expect(
      uploadOne("after", blobOf(10, "image/jpeg"), { requestTicket: async () => Promise.reject(apiErr), codec: codec(100) }),
    ).rejects.toBe(apiErr);
  });
});

describe("uploadErrorMessage", () => {
  it("shows the Thai message of upload and API errors, FILE_NOT_UPLOADED otherwise", () => {
    expect(uploadErrorMessage(new UploadError("UPLOAD_TOO_LARGE", "x"))).toBe("x");
    expect(uploadErrorMessage(new ApiClientError("FORBIDDEN", "ไม่มีสิทธิ์", 403))).toBe("ไม่มีสิทธิ์");
    expect(uploadErrorMessage(new Error("boom"))).toBe(ERROR_MESSAGE_TH.FILE_NOT_UPLOADED);
  });
});

/** minimal XMLHttpRequest stand-in */
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
}

describe("xhrPut", () => {
  it("PUTs the blob with the ticket headers and reports progress", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const progress = vi.fn();
    const blob = blobOf(100, "image/webp");
    const done = xhrPut(ticket, blob, progress);
    const xhr = FakeXhr.last;
    expect(xhr).toMatchObject({ method: "PUT", url: ticket.uploadUrl, headers: ticket.headers, body: blob });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 0 });
    xhr.status = 200;
    xhr.onload?.();
    await expect(done).resolves.toBeUndefined();
    expect(progress.mock.calls).toEqual([[0.25], [1]]);
  });

  it("rejects with FILE_NOT_UPLOADED on a non-2xx status or a network error", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const forbidden = xhrPut(ticket, blobOf(1, "image/webp"), () => {});
    FakeXhr.last.status = 403;
    FakeXhr.last.onload?.();
    await expect(forbidden).rejects.toMatchObject({ code: "FILE_NOT_UPLOADED" });
    const offline = xhrPut(ticket, blobOf(1, "image/webp"), () => {});
    FakeXhr.last.onerror?.();
    await expect(offline).rejects.toMatchObject({ code: "FILE_NOT_UPLOADED" });
  });
});

describe("ticket endpoints", () => {
  it("staffTicket posts to staff.uploadUrl; customerTicket to the branch LIFF route", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(ticket), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = { kind: "after" as const, mimeType: "image/webp", sizeBytes: 10 };
    await expect(staffTicket(body)).resolves.toEqual(ticket);
    await expect(customerTicket("happy-paws")({ ...body, kind: "slip" })).resolves.toEqual(ticket);
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1].method])).toEqual([
      ["/api/v1/staff/files/upload-url", "POST"],
      ["/api/v1/liff/happy-paws/files/upload-url", "POST"],
    ]);
  });
});
