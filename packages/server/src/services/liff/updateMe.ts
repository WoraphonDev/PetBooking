import type { LiffUpdateMeRequest, LiffUpdateMeResponse } from "@app/contracts/endpoints/liff.updateMe";
import { consentRecord, customer, ownerProfile } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { myProfile } from "./me.ts";

/** 10#legal-docs: photo_consent text version shown in L-01 / L-15 */
const PHOTO_CONSENT_VERSION = "2026-10-01";

export async function liffUpdateMe(ctx: RequestContext, input: LiffUpdateMeRequest): Promise<LiffUpdateMeResponse> {
  let phoneE164: string | undefined;
  if (input.phone !== undefined) {
    const normalized = normalizePhone({ input: input.phone });
    if (!normalized.e164) throw new AppError("INVALID_PHONE");
    phoneE164 = normalized.e164;
  }
  return withTx(ctx, async (tx) => {
    if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("NOT_FOUND");
    const db = tenantDb(ctx, tx);
    const [cust] = (await db.select(customer, eq(customer.id, ctx.actor.id))) as (typeof customer.$inferSelect)[];
    if (!cust) throw new AppError("NOT_FOUND");

    const profileChanges = {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName || null } : {}),
      ...(input.nickname !== undefined ? { nickname: input.nickname || null } : {}),
      ...(phoneE164 !== undefined ? { phoneE164 } : {}),
      ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() || null } : {}),
    };
    // owner_profile has no organization_id: the id comes from the org-checked customer
    if (Object.keys(profileChanges).length)
      await tx.update(ownerProfile).set(profileChanges).where(eq(ownerProfile.id, cust.ownerProfileId));

    if (input.photoConsent !== undefined) {
      await db.update(
        customer,
        { photoConsent: input.photoConsent ? "granted" : "denied", photoConsentAt: ctx.now },
        eq(customer.id, cust.id),
      );
      await tx.insert(consentRecord).values({
        subjectType: "owner_profile",
        subjectId: cust.ownerProfileId,
        organizationId: cust.organizationId,
        document: "photo_consent",
        version: PHOTO_CONSENT_VERSION,
        accepted: input.photoConsent,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return myProfile(ctx, tx);
  });
}
