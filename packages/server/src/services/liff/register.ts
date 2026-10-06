import type { LiffRegisterRequest, LiffRegisterResponse } from "@app/contracts/endpoints/liff.register";
import { branch, consentRecord, customer, customerLinkRequest, lineChannel, lineIdentity, ownerProfile, staffUser } from "@app/db/schema";
import { formatPhone, normalizePhone } from "@app/domain/format/phone";
import { and, eq, inArray, ne } from "drizzle-orm";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** 10#legal-docs current versions (reference-data legalDocs) */
const LEGAL = {
  privacy: referenceData.legalDocs.privacy_notice.version,
  terms: referenceData.legalDocs.terms_of_service.version,
  photo: referenceData.legalDocs.photo_consent.version,
};

/**
 * 05#ep-liff.register (one transaction), for the placeholder owner_profile liff.session created (Q-1031):
 * - phone normalized by R-22 (INVALID_PHONE); privacyVersion must be the latest (VALIDATION_FAILED)
 * - a pending link request of this LINE identity → LINK_REQUEST_PENDING; an existing customer → session as is (Q-1045)
 * - the profile is filled and consent_record ×3 written (privacy_notice, terms_of_service, photo_consent)
 * - phone of an existing customer of this shop → customer_link_request (no auto-link) + staff.link_request to active
 *   front_desk + owner (dedupe link_request:{requestId}); otherwise → customer (source_channel line_liff, photo consent)
 */
export async function liffRegister(ctx: RequestContext, input: LiffRegisterRequest, http: HttpExtras): Promise<LiffRegisterResponse> {
  const phone = normalizePhone({ input: input.phone });
  if (!phone.e164) throw new AppError("INVALID_PHONE");
  const phoneE164 = phone.e164;
  if (input.privacyVersion !== LEGAL.privacy)
    throw new AppError("VALIDATION_FAILED", { fields: { privacyVersion: "not the latest privacy notice" } });
  const ownerProfileId = http.session?.subjectId;
  if (!ownerProfileId || !ctx.branchId) throw new AppError("NOT_FOUND");
  const branchId = ctx.branchId;

  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [br] = (await db.select(branch, eq(branch.id, branchId))) as (typeof branch.$inferSelect)[];
    const [channel] = (await db.select(lineChannel, eq(lineChannel.branchId, branchId))) as (typeof lineChannel.$inferSelect)[];
    if (!br || !channel) throw new AppError("NOT_FOUND");
    // line_identity has no organization_id: the session subject + this shop's LINE provider identify it
    const [identity] = await tx
      .select()
      .from(lineIdentity)
      .where(and(eq(lineIdentity.ownerProfileId, ownerProfileId), eq(lineIdentity.providerId, channel.providerId)));
    if (!identity) throw new AppError("NOT_FOUND");

    const session = (registered: boolean, linkPending: boolean, customerId: string | null): LiffRegisterResponse => ({
      registered,
      linkPending,
      profile: { displayName: identity.displayName, pictureUrl: identity.pictureUrl },
      customerId,
      legalVersions: { privacy: LEGAL.privacy, terms: LEGAL.terms },
    });

    const [already] = (await db.select(customer, eq(customer.ownerProfileId, ownerProfileId))) as (typeof customer.$inferSelect)[];
    if (already) return session(true, false, already.id);
    const pending = await db.select(
      customerLinkRequest,
      and(eq(customerLinkRequest.lineIdentityId, identity.id), eq(customerLinkRequest.status, "pending")),
    );
    if (pending.length) throw new AppError("LINK_REQUEST_PENDING");

    // owner_profile has no organization_id: the id is the session subject checked against this shop's line_identity above
    await tx
      .update(ownerProfile)
      .set({
        firstName: input.firstName,
        lastName: input.lastName || null,
        nickname: input.nickname || null,
        phoneE164,
        updatedAt: ctx.now,
      })
      .where(eq(ownerProfile.id, ownerProfileId));
    const consent = (document: "privacy_notice" | "terms_of_service" | "photo_consent", version: string, accepted: boolean) => ({
      subjectType: "owner_profile" as const,
      subjectId: ownerProfileId,
      organizationId: br.organizationId,
      document,
      version,
      accepted,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      createdAt: ctx.now,
    });
    await tx
      .insert(consentRecord)
      .values([
        consent("privacy_notice", input.privacyVersion, true),
        consent("terms_of_service", input.termsVersion, true),
        consent("photo_consent", LEGAL.photo, input.photoConsent),
      ]);

    // an existing customer of this shop with the same phone (another owner_profile) → the shop confirms the link
    const [candidate] = await tx
      .select({ id: customer.id })
      .from(customer)
      .innerJoin(ownerProfile, eq(ownerProfile.id, customer.ownerProfileId))
      .where(
        and(eq(customer.organizationId, br.organizationId), eq(ownerProfile.phoneE164, phoneE164), ne(ownerProfile.id, ownerProfileId)),
      )
      .limit(1);
    if (candidate) {
      const [request] = (await db.insert(customerLinkRequest, {
        lineIdentityId: identity.id,
        newOwnerProfileId: ownerProfileId,
        candidateCustomerId: candidate.id,
        phoneEntered: phoneE164,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })) as (typeof customerLinkRequest.$inferSelect)[];
      if (!request) throw new Error("liff.register: link request insert returned no row");
      const staff = (await db.select(
        staffUser,
        and(inArray(staffUser.role, ["front_desk", "owner"]), eq(staffUser.status, "active")),
      )) as (typeof staffUser.$inferSelect)[];
      for (const member of staff)
        await enqueueNotification(tx, ctx, {
          key: "staff.link_request",
          recipient: { type: "staff", id: member.id },
          payload: { lineName: identity.displayName ?? input.firstName, phone: formatPhone({ e164: phoneE164 }) },
          dedupeKey: `link_request:${request.id}`,
        });
      return session(false, true, null);
    }

    const [created] = (await db.insert(customer, {
      ownerProfileId,
      sourceChannel: "line_liff",
      photoConsent: input.photoConsent ? "granted" : "denied",
      photoConsentAt: ctx.now,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof customer.$inferSelect)[];
    if (!created) throw new Error("liff.register: customer insert returned no row");
    return session(true, false, created.id);
  });
}
