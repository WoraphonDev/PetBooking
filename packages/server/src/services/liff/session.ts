import type { LiffSessionParams, LiffSessionRequest, LiffSessionResponse } from "@app/contracts/endpoints/liff.session";
import { branch, customer, customerLinkRequest, lineChannel, lineIdentity, ownerProfile } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { sessionCookie } from "../../auth/cookies.ts";
import { createSession } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { verifyLineIdToken } from "../../integrations/line/idtoken.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** 10#legal-docs: current versions the customer accepts in liff.register */
const LEGAL_VERSIONS = { privacy: "2026-10-01", terms: "2026-10-01" };

export async function liffSession(
  ctx: RequestContext,
  input: LiffSessionRequest & LiffSessionParams,
  http: HttpExtras,
): Promise<LiffSessionResponse> {
  // the slug is the only key a LIFF visitor has: this lookup finds the tenant before tenantDb can scope anything
  const [br] = await getDb().select().from(branch).where(eq(branch.bookingSlug, input.branchSlug));
  if (!br) throw new AppError("NOT_FOUND");
  const scoped: RequestContext = { ...ctx, orgId: br.organizationId, branchId: br.id, timezone: br.timezone };
  const [channel] = (await tenantDb(scoped, getDb()).select(
    lineChannel,
    eq(lineChannel.branchId, br.id),
  )) as (typeof lineChannel.$inferSelect)[];
  if (channel?.status !== "active") throw new AppError("LINE_NOT_CONNECTED");

  const profile = await verifyLineIdToken({ idToken: input.idToken, loginChannelId: channel.loginChannelId });
  if (!profile) throw new AppError("LINE_TOKEN_INVALID");

  return withTx(scoped, async (tx) => {
    // line_identity has no organization_id: unique per (provider, LINE user)
    const [existing] = await tx
      .select()
      .from(lineIdentity)
      .where(and(eq(lineIdentity.providerId, channel.providerId), eq(lineIdentity.lineUserId, profile.sub)));
    let identity: typeof lineIdentity.$inferSelect;
    if (existing) {
      const [updated] = await tx
        .update(lineIdentity)
        .set({ displayName: profile.name, pictureUrl: profile.picture })
        .where(eq(lineIdentity.id, existing.id))
        .returning();
      identity = updated ?? existing;
    } else {
      // Q-1031: first visit → placeholder owner_profile (filled by liff.register) so the identity and the session have a subject
      const [created] = await tx
        .insert(ownerProfile)
        .values({ createdInOrgId: br.organizationId, firstName: profile.name ?? "" })
        .returning();
      if (!created) throw new Error("liff.session: owner_profile insert returned no row");
      const [inserted] = await tx
        .insert(lineIdentity)
        .values({
          providerId: channel.providerId,
          lineUserId: profile.sub,
          ownerProfileId: created.id,
          displayName: profile.name,
          pictureUrl: profile.picture,
        })
        .returning();
      if (!inserted) throw new Error("liff.session: line_identity insert returned no row");
      identity = inserted;
    }

    const db = tenantDb(scoped, tx);
    const [cust] = (await db.select(customer, eq(customer.ownerProfileId, identity.ownerProfileId))) as (typeof customer.$inferSelect)[];
    const pending = await db.select(
      customerLinkRequest,
      and(eq(customerLinkRequest.lineIdentityId, identity.id), eq(customerLinkRequest.status, "pending")),
    );

    const created = await createSession(
      tx,
      {
        subjectType: "customer",
        subjectId: identity.ownerProfileId,
        organizationId: br.organizationId,
        branchId: br.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      ctx.now,
    );
    http.setCookie(sessionCookie("customer", created.token, created.session.expiresAt));

    return {
      registered: !!cust,
      linkPending: pending.length > 0,
      profile: { displayName: identity.displayName, pictureUrl: identity.pictureUrl },
      customerId: cust?.id ?? null,
      legalVersions: LEGAL_VERSIONS,
    };
  });
}
