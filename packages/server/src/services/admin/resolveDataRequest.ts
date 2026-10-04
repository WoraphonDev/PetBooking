import type { AdminResolveDataRequestRequest, AdminResolveDataRequestResponse } from "@app/contracts/endpoints/admin.resolveDataRequest";
import { dataRequest, organization, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** PDPA erasure (05#ep-admin.resolveDataRequest): personal values cleared; bills/bookings stay for accounting law. */
const ERASED_NAME = "ลบแล้ว";

/**
 * Closes an open PDPA request. `delete` + done → owner_profile erased (name 'ลบแล้ว', phone/email/address null,
 * erased_at = now) + audit `pdpa.erase`. `access` + done only records the resolution — the JSON export and its delivery
 * channel are not specified yet (Q-0096).
 */
export async function adminResolveDataRequest(
  ctx: RequestContext,
  input: AdminResolveDataRequestRequest & { requestId: string },
): Promise<AdminResolveDataRequestResponse> {
  if (ctx.actor.type !== "admin") throw new AppError("FORBIDDEN");
  return withTx(ctx, async (tx) => {
    // platform-wide lookup: the request names its organization, every write then goes through that tenant
    const [found] = await tx
      .select({ organizationId: dataRequest.organizationId })
      .from(dataRequest)
      .where(eq(dataRequest.id, input.requestId));
    if (!found) throw new AppError("NOT_FOUND");
    const orgCtx: RequestContext = { ...ctx, orgId: found.organizationId };
    const db = tenantDb(orgCtx, tx);
    const [req] = (await db.select(dataRequest, eq(dataRequest.id, input.requestId)).for("update")) as (typeof dataRequest.$inferSelect)[];
    if (!req) throw new AppError("NOT_FOUND");
    // open → done | rejected, once (Q-0096)
    if (req.status !== "open") throw new AppError("INVALID_TRANSITION");

    if (req.type === "delete" && input.status === "done") {
      // owner_profile is shared across shops (no organization_id); reached through the org-checked request
      const [person] = await tx.select().from(ownerProfile).where(eq(ownerProfile.id, req.ownerProfileId));
      if (!person) throw new AppError("NOT_FOUND");
      await tx
        .update(ownerProfile)
        .set({
          firstName: ERASED_NAME,
          lastName: null,
          nickname: null,
          phoneE164: null,
          email: null,
          addressLine: null,
          subdistrict: null,
          district: null,
          province: null,
          postalCode: null,
          erasedAt: ctx.now,
          updatedAt: ctx.now,
        })
        .where(eq(ownerProfile.id, person.id));
      await writeAudit(tx, orgCtx, {
        action: "pdpa.erase",
        entityType: "owner_profile",
        entityId: person.id,
        reason: input.note ?? null,
        before: { erasedAt: null },
        after: { erasedAt: ctx.now.toISOString(), dataRequestId: req.id },
      });
    }
    const [updated] = (await db.update(
      dataRequest,
      { status: input.status, note: input.note ?? null, resolvedBy: ctx.actor.id, resolvedAt: ctx.now, updatedAt: ctx.now },
      eq(dataRequest.id, req.id),
    )) as (typeof dataRequest.$inferSelect)[];
    if (!updated) throw new AppError("NOT_FOUND");
    const [org] = await tx.select({ name: organization.name }).from(organization).where(eq(organization.id, updated.organizationId));
    return {
      id: updated.id,
      orgName: org?.name ?? "",
      ownerProfileId: updated.ownerProfileId,
      type: updated.type,
      status: updated.status,
      note: updated.note,
      createdAt: updated.createdAt.toISOString(),
    };
  });
}
