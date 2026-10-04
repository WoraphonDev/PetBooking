import { Uuid } from "@app/contracts/common";
import type { PhotoItem } from "@app/contracts/dto/photo-item";
import type { PhotosListQuery, PhotosListRequest, PhotosListResponse } from "@app/contracts/endpoints/photos.list";
import { customer, pet, petPhoto } from "@app/db/schema";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Shared pet access is reached only through this organization's customer relationships. */
export async function requirePhotoPet(ctx: RequestContext, tx: Executor, petId: string): Promise<void> {
  if (!ctx.orgId) throw new AppError("NOT_FOUND");
  const scopedCustomers = (await tenantDb(ctx, tx).select(customer)) as (typeof customer.$inferSelect)[];
  if (!scopedCustomers.length) throw new AppError("NOT_FOUND");
  const [found] = await tx
    .select({ id: pet.id })
    .from(pet)
    .where(
      and(
        eq(pet.id, petId),
        inArray(
          pet.ownerProfileId,
          scopedCustomers.map((c) => c.ownerProfileId),
        ),
      ),
    );
  if (!found) throw new AppError("NOT_FOUND");
}
export async function photoItem(ctx: RequestContext, tx: Executor, row: typeof petPhoto.$inferSelect): Promise<PhotoItem> {
  return {
    id: row.id,
    kind: row.kind,
    url: await signedUrl(tx, ctx, row.fileId),
    caption: row.caption,
    takenAt: row.takenAt.toISOString(),
    appointmentId: row.appointmentId,
    stayId: row.stayId,
  };
}
export async function photosList(ctx: RequestContext, input: PhotosListRequest & PhotosListQuery): Promise<PhotosListResponse> {
  requireRole(ctx, "photos.list");
  const tx = getDb();
  await requirePhotoPet(ctx, tx, input.petId);
  const conditions: SQL[] = [eq(petPhoto.petId, input.petId)];
  if (input.kind) conditions.push(eq(petPhoto.kind, input.kind));
  if (input.cursor) {
    let cursor: unknown;
    try {
      cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
    } catch {
      throw new AppError("VALIDATION_FAILED");
    }
    if (
      !Array.isArray(cursor) ||
      cursor.length !== 2 ||
      typeof cursor[0] !== "string" ||
      Number.isNaN(Date.parse(cursor[0])) ||
      typeof cursor[1] !== "string" ||
      !Uuid.safeParse(cursor[1]).success
    )
      throw new AppError("VALIDATION_FAILED");
    conditions.push(sql`(${petPhoto.takenAt}, ${petPhoto.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`);
  }
  const rows = (await tenantDb(ctx, tx)
    .select(petPhoto, and(...conditions))
    .orderBy(desc(petPhoto.takenAt), desc(petPhoto.id))
    .limit(input.limit + 1)) as (typeof petPhoto.$inferSelect)[];
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: await Promise.all(page.map((row) => photoItem(ctx, tx, row))),
    nextCursor:
      rows.length > input.limit && last ? Buffer.from(JSON.stringify([last.takenAt.toISOString(), last.id])).toString("base64url") : null,
  };
}
