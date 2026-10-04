import type { PhotosAddRequest, PhotosAddResponse } from "@app/contracts/endpoints/photos.add";
import { groomAppointment, petPhoto, stay } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { photoItem, requirePhotoPet } from "./list.ts";

export async function photosAdd(ctx: RequestContext, input: PhotosAddRequest & { petId: string }): Promise<PhotosAddResponse> {
  requireRole(ctx, "photos.add");
  return withTx(ctx, async (tx) => {
    await requirePhotoPet(ctx, tx, input.petId);
    const db = tenantDb(ctx, tx);
    if (input.appointmentId) {
      const [appointment] = await db.select(
        groomAppointment,
        and(eq(groomAppointment.id, input.appointmentId), eq(groomAppointment.petId, input.petId)),
      );
      if (!appointment) throw new AppError("NOT_FOUND");
    }
    if (input.stayId) {
      const [record] = await db.select(stay, and(eq(stay.id, input.stayId), eq(stay.petId, input.petId)));
      if (!record) throw new AppError("NOT_FOUND");
    }
    const kinds = { profile: "pet_profile", before: "before", after: "after", stay: "stay_update" } as const;
    await commitFile(tx, ctx, input.fileId, kinds[input.kind]);
    const [row] = (await db.insert(petPhoto, {
      petId: input.petId,
      fileId: input.fileId,
      kind: input.kind,
      appointmentId: input.appointmentId ?? null,
      stayId: input.stayId ?? null,
      caption: input.caption ?? null,
      takenAt: ctx.now,
      uploadedBy: ctx.actor.id,
      createdAt: ctx.now,
    })) as (typeof petPhoto.$inferSelect)[];
    if (!row) throw new Error("photos.add: no inserted photo");
    return photoItem(ctx, tx, row);
  });
}
