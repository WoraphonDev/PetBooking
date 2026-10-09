import type { LinkRequestsApproveRequest, LinkRequestsApproveResponse } from "@app/contracts/endpoints/linkRequests.approve";
import {
  booking,
  branch,
  consentRecord,
  customer,
  customerLinkRequest,
  dataRequest,
  lineIdentity,
  ownerProfile,
  pet,
} from "@app/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Tx, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import { linkRequestItems } from "./list.ts";

type RequestRow = typeof customerLinkRequest.$inferSelect;

/**
 * "Same person" (03#sm-customer_link_request pending → approved, Q-1052): the LINE identity moves to the candidate's
 * owner_profile; pets the new profile created in this shop and bookings of its customer here (if any) move to the
 * candidate; the new profile is deleted once nothing references it (its consent records are copied to the candidate's
 * profile and this request points there). audit customer.merge_link_approve and customer.link_approved, all in one transaction.
 */
export async function linkRequestsApprove(ctx: RequestContext, input: LinkRequestsApproveRequest): Promise<LinkRequestsApproveResponse> {
  requireRole(ctx, "linkRequests.approve");
  return withTx(ctx, async (tx) => {
    const updated = (await transition(tx, ctx, {
      table: customerLinkRequest,
      id: input.requestId,
      machine: "customer_link_request",
      to: "approved",
      extraSet: { decidedBy: ctx.actor.id, decidedAt: ctx.now },
    })) as RequestRow;

    const db = tenantDb(ctx, tx);
    const [candidate] = (await db.select(customer, eq(customer.id, updated.candidateCustomerId))) as (typeof customer.$inferSelect)[];
    if (!candidate) throw new AppError("NOT_FOUND");
    const fromProfile = updated.newOwnerProfileId;
    const toProfile = candidate.ownerProfileId;

    // line_identity / pet are shared tables without organization_id; reached through the org-checked request
    await tx.update(lineIdentity).set({ ownerProfileId: toProfile, updatedAt: ctx.now }).where(eq(lineIdentity.id, updated.lineIdentityId));
    const movedPets = await tx
      .update(pet)
      .set({ ownerProfileId: toProfile, updatedAt: ctx.now })
      .where(and(eq(pet.ownerProfileId, fromProfile), eq(pet.createdInOrgId, ctx.orgId ?? "")))
      .returning({ id: pet.id });
    const [own] = (await db.select(customer, eq(customer.ownerProfileId, fromProfile))) as (typeof customer.$inferSelect)[];
    const movedBookings = own
      ? ((await db.update(booking, { customerId: candidate.id, updatedAt: ctx.now }, eq(booking.customerId, own.id))) as {
          id: string;
        }[])
      : [];
    const deleted = await deleteIfEmpty(tx, ctx, updated, toProfile);

    await writeAudit(tx, ctx, {
      action: "customer.merge_link_approve",
      entityType: "customer_link_request",
      entityId: updated.id,
      before: { status: "pending", ownerProfileId: fromProfile },
      after: {
        status: "approved",
        ownerProfileId: toProfile,
        customerId: candidate.id,
        lineIdentityId: updated.lineIdentityId,
        petIds: movedPets.map((p) => p.id),
        bookingIds: movedBookings.map((b) => b.id),
        deletedOwnerProfileId: deleted ? fromProfile : null,
      },
    });

    const [br] = ctx.branchId ? ((await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[]) : [];
    await enqueueNotification(tx, ctx, {
      key: "customer.link_approved",
      recipient: { type: "customer", id: candidate.id },
      payload: { shopName: br?.name ?? "" },
      dedupeKey: `link_approved:${updated.id}`,
    });

    const [row] = (await db.select(customerLinkRequest, eq(customerLinkRequest.id, updated.id))) as RequestRow[];
    const [item] = await linkRequestItems(ctx, tx, [row ?? updated]);
    if (!item) throw new AppError("NOT_FOUND");
    return item;
  });
}

/**
 * Deletes the LINE-made profile when nothing else uses it: no customer in any shop, no pet, no data request, no other
 * LINE identity or link request. Its consent records are copied to the candidate's profile and this request points there.
 */
async function deleteIfEmpty(tx: Tx, ctx: RequestContext, request: RequestRow, toProfile: string): Promise<boolean> {
  const id = request.newOwnerProfileId;
  // existence checks across shops: the profile is shared, and any reference blocks the delete
  const [inUse] = await Promise.all([
    tx.select({ id: customer.id }).from(customer).where(eq(customer.ownerProfileId, id)).limit(1),
    tx.select({ id: pet.id }).from(pet).where(eq(pet.ownerProfileId, id)).limit(1),
    tx.select({ id: dataRequest.id }).from(dataRequest).where(eq(dataRequest.ownerProfileId, id)).limit(1),
    tx.select({ id: lineIdentity.id }).from(lineIdentity).where(eq(lineIdentity.ownerProfileId, id)).limit(1),
    tx
      .select({ id: customerLinkRequest.id })
      .from(customerLinkRequest)
      .where(and(eq(customerLinkRequest.newOwnerProfileId, id), ne(customerLinkRequest.id, request.id)))
      .limit(1),
  ]).then((found) => found.filter((rows) => rows.length > 0));
  if (inUse) return false;
  // consent_record is append-only: the candidate's profile gets a copy of each answer, the originals stay as evidence
  const consents = await tx
    .select()
    .from(consentRecord)
    .where(and(eq(consentRecord.subjectType, "owner_profile"), eq(consentRecord.subjectId, id)));
  if (consents.length) await tx.insert(consentRecord).values(consents.map(({ id: _id, ...c }) => ({ ...c, subjectId: toProfile })));
  await tenantDb(ctx, tx).update(
    customerLinkRequest,
    { newOwnerProfileId: toProfile, updatedAt: ctx.now },
    eq(customerLinkRequest.id, request.id),
  );
  await tx.delete(ownerProfile).where(eq(ownerProfile.id, id));
  return true;
}
