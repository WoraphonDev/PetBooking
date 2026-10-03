import type { AuthInvitePreviewRequest, AuthInvitePreviewResponse } from "@app/contracts/endpoints/auth.invitePreview";
import { organization, staffInvite, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { hashToken } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Public read of an invite by its token for A-04 (05#ep-auth.invitePreview, Q-0044); no session is created. */
export async function authInvitePreview(ctx: RequestContext, input: AuthInvitePreviewRequest): Promise<AuthInvitePreviewResponse> {
  const db = getDb();
  // The public token identifies the invite; resolve its tenant before scoped access (as auth.inviteAccept).
  const tokenHash = hashToken(input.token);
  const [identity] = await db
    .select({ organizationId: staffInvite.organizationId })
    .from(staffInvite)
    .where(eq(staffInvite.tokenHash, tokenHash));
  if (!identity) throw new AppError("TOKEN_INVALID");
  const scoped = tenantDb({ ...ctx, orgId: identity.organizationId }, db);
  const [invite] = (await scoped.select(staffInvite, eq(staffInvite.tokenHash, tokenHash))) as (typeof staffInvite.$inferSelect)[];
  if (!invite || invite.acceptedAt !== null || invite.expiresAt.getTime() <= ctx.now.getTime()) throw new AppError("TOKEN_INVALID");
  const [staff] = (await scoped.select(staffUser, eq(staffUser.id, invite.staffUserId))) as (typeof staffUser.$inferSelect)[];
  if (staff?.status !== "invited") throw new AppError("TOKEN_INVALID");
  // organization is the global registry row of this tenant
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, identity.organizationId));
  if (!org) throw new AppError("TOKEN_INVALID");
  return { orgName: org.name, role: staff.role, hasEmail: staff.email !== null };
}
