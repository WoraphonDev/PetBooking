import type { StaysPostUpdateRequest, StaysPostUpdateResponse } from "@app/contracts/endpoints/stays.postUpdate";
import { booking, branch, pet, petPhoto, stay } from "@app/db/schema";
import { toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { stayDetail } from "./get.ts";

/**
 * 05#ep-stays.postUpdate: each stay_update file (committed) becomes a pet_photo kind stay with the caption; unless
 * notifyCustomer is false, customer.stay_update {petName, updatesUrl = L-10} at most once per stay per branch-local day
 * (dedupe stay_update:{stayId}:{localDate}; R-18 applies when the outbox sends it).
 */
export async function staysPostUpdate(
  ctx: RequestContext,
  input: StaysPostUpdateRequest & { stayId: string },
): Promise<StaysPostUpdateResponse> {
  requireRole(ctx, "stays.postUpdate");
  if (new Set(input.fileIds).size !== input.fileIds.length)
    throw new AppError("VALIDATION_FAILED", { fields: { fileIds: "duplicate file" } });
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId))) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    for (const fileId of input.fileIds) {
      await commitFile(tx, ctx, fileId, "stay_update");
      await db.insert(petPhoto, {
        petId: s.petId,
        fileId,
        kind: "stay",
        stayId: s.id,
        caption: input.caption || null,
        takenAt: ctx.now,
        uploadedBy: ctx.actor.id,
        createdAt: ctx.now,
      });
    }
    if (!input.notifyCustomer) return;
    const [bk] = (await db.select(booking, eq(booking.id, s.bookingId))) as (typeof booking.$inferSelect)[];
    const [br] = (await db.select(branch, eq(branch.id, s.branchId))) as (typeof branch.$inferSelect)[];
    if (!bk || !br) throw new AppError("NOT_FOUND");
    // pet has no organization_id: reached through the org-checked stay
    const [p] = await tx.select({ name: pet.name }).from(pet).where(eq(pet.id, s.petId));
    const localDate = toLocalDate({ instant: ctx.now.toISOString(), timezone: br.timezone });
    await enqueueNotification(
      tx,
      { ...ctx, branchId: br.id, timezone: br.timezone },
      {
        key: "customer.stay_update",
        recipient: { type: "customer", id: bk.customerId },
        payload: {
          petName: p?.name ?? "",
          updatesUrl: new URL(`/liff/${br.bookingSlug}/stays/${s.id}`, process.env.APP_BASE_URL).toString(),
        },
        dedupeKey: `stay_update:${s.id}:${localDate}`,
      },
    );
  });
  return stayDetail(ctx, getDb(), input.stayId);
}
