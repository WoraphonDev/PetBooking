import type { LinkRequestsRejectRequest, LinkRequestsRejectResponse } from "@app/contracts/endpoints/linkRequests.reject";
import { consentRecord, customer, customerLinkRequest } from "@app/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { linkRequestItems } from "./list.ts";

/**
 * "Not the same person": pending → rejected, and the profile created from LINE becomes a new customer of the shop
 * (03#sm-customer_link_request), the same way liff.register creates one when the phone matches nobody.
 */
export async function linkRequestsReject(ctx: RequestContext, input: LinkRequestsRejectRequest): Promise<LinkRequestsRejectResponse> {
  requireRole(ctx, "linkRequests.reject");
  return withTx(ctx, async (tx) => {
    const updated = (await transition(tx, ctx, {
      table: customerLinkRequest,
      id: input.requestId,
      machine: "customer_link_request",
      to: "rejected",
      extraSet: { decidedBy: ctx.actor.id, decidedAt: ctx.now },
    })) as typeof customerLinkRequest.$inferSelect;

    const db = tenantDb(ctx, tx);
    const [existing] = await db.select(customer, eq(customer.ownerProfileId, updated.newOwnerProfileId));
    if (!existing) {
      // liff.register kept the photo-consent answer as a consent_record of the new profile
      const [photo] = await tx
        .select({ accepted: consentRecord.accepted, at: consentRecord.createdAt })
        .from(consentRecord)
        .where(
          and(
            eq(consentRecord.subjectType, "owner_profile"),
            eq(consentRecord.subjectId, updated.newOwnerProfileId),
            eq(consentRecord.document, "photo_consent"),
          ),
        )
        .orderBy(desc(consentRecord.createdAt))
        .limit(1);
      await db.insert(customer, {
        ownerProfileId: updated.newOwnerProfileId,
        sourceChannel: "line_liff",
        photoConsent: photo ? (photo.accepted ? "granted" : "denied") : "unknown",
        photoConsentAt: photo?.at ?? null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
    }
    const [item] = await linkRequestItems(ctx, tx, [updated]);
    if (!item) throw new AppError("NOT_FOUND");
    return item;
  });
}
