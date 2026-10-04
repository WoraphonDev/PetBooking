// File lifecycle (01 §9, R-25): upload ticket (file_object + presigned PUT) → client PUTs to storage →
// the endpoint that references fileId calls commitFile → reads go through signedUrl. Uncommitted files are removed after 24 h.
import { randomUUID } from "node:crypto";
import type { UploadTicket } from "@app/contracts/dto/upload-ticket";
import type { FileKind } from "@app/contracts/enums";
import { fileObject } from "@app/db/schema";
import { validateUpload } from "@app/domain/files/upload-policy";
import { and, eq, isNull } from "drizzle-orm";
import type { RequestContext } from "./context.ts";
import type { Executor, Tx } from "./db.ts";
import { AppError } from "./errors.ts";
import { getStorage } from "./integrations/storage/index.ts";
import { tenantDb } from "./repo/tenant.ts";

type FileRow = typeof fileObject.$inferSelect;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
  "text/csv": "csv",
};

/** R-25 step 3: `org/{orgId}/{kind}/{yyyy}/{mm}/{uuid}.{ext}` (year/month of ctx.now in UTC). */
export function storageKeyFor(orgId: string, kind: FileKind, mimeType: string, id: string, now: Date): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `org/${orgId}/${kind}/${yyyy}/${mm}/${id}.${EXT[mimeType] ?? "bin"}`;
}

export type UploadRequest = { kind: FileKind; mimeType: string; sizeBytes: number; width?: number; height?: number };

/** R-25 check, then a file_object (committed_at null) and a presigned PUT for it. */
export async function createUploadTicket(tx: Tx, ctx: RequestContext, input: UploadRequest): Promise<UploadTicket> {
  if (!ctx.orgId) throw new AppError("NOT_FOUND");
  const mimeType = input.mimeType.toLowerCase();
  const check = validateUpload({ kind: input.kind, mimeType, sizeBytes: input.sizeBytes });
  if (!check.ok) throw new AppError(check.error as "UPLOAD_KIND_NOT_ALLOWED" | "UPLOAD_TYPE_NOT_ALLOWED" | "UPLOAD_TOO_LARGE");
  const id = randomUUID();
  const storageKey = storageKeyFor(ctx.orgId, input.kind, mimeType, id, ctx.now);
  await tenantDb(ctx, tx).insert(fileObject, {
    id,
    kind: input.kind,
    storageKey,
    mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width ?? null,
    height: input.height ?? null,
    uploadedByType: ctx.actor.type === "customer" ? "customer" : ctx.actor.type === "staff" ? "staff" : "platform_admin",
    uploadedById: ctx.actor.id,
    createdAt: ctx.now,
  });
  const uploadUrl = await getStorage().presignPut({ key: storageKey, contentType: mimeType, sizeBytes: input.sizeBytes });
  return { fileId: id, uploadUrl, headers: { "Content-Type": mimeType }, storageKey };
}

async function liveFile(db: Executor, ctx: RequestContext, fileId: string): Promise<FileRow> {
  const [row] = (await tenantDb(ctx, db).select(fileObject, and(eq(fileObject.id, fileId), isNull(fileObject.deletedAt)))) as FileRow[];
  // another org's file, a deleted file and an unknown id all look the same
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/**
 * Binds an uploaded file to the data that references it: same org, expected kind, object really in storage (HEAD).
 * Wrong kind → VALIDATION_FAILED; no object yet → FILE_NOT_UPLOADED. Committing an already committed file is a no-op.
 */
export async function commitFile(tx: Tx, ctx: RequestContext, fileId: string, expectedKind: FileKind): Promise<FileRow> {
  const row = await liveFile(tx, ctx, fileId);
  if (row.kind !== expectedKind) throw new AppError("VALIDATION_FAILED", { fields: { fileId: `expected a ${expectedKind} file` } });
  if (row.committedAt) return row;
  if (!(await getStorage().head(row.storageKey))) throw new AppError("FILE_NOT_UPLOADED");
  await tenantDb(ctx, tx).update(fileObject, { committedAt: ctx.now }, eq(fileObject.id, row.id));
  return { ...row, committedAt: ctx.now };
}

/** Signed GET URL (1 h) for a file of the caller's org. */
export async function signedUrl(db: Executor, ctx: RequestContext, fileId: string): Promise<string> {
  const row = await liveFile(db, ctx, fileId);
  return getStorage().presignGet(row.storageKey);
}
