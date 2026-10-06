import type { StaffMeLinkLineRequest, StaffMeLinkLineResponse } from "@app/contracts/endpoints/staffMe.linkLine";
import { staffUser } from "@app/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { verifyLineIdToken } from "../../integrations/line/idtoken.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { authMe } from "../auth/me.ts";

/**
 * 05#ep-staffMe.linkLine: verify the ID token against PLATFORM_LINE_LOGIN_CHANNEL_ID (LINE_TOKEN_INVALID, as auth.staffLine)
 * and store sub as the caller's staff_user.line_user_id; a LINE account already linked to another staff member → EMAIL_TAKEN
 * (the 05 code for this unique clash, Q-1041). Returns StaffMe (lineLinked = true).
 */
export async function staffMeLinkLine(ctx: RequestContext, input: StaffMeLinkLineRequest): Promise<StaffMeLinkLineResponse> {
  requireRole(ctx, "staffMe.linkLine");
  if (ctx.actor.type !== "staff" || !ctx.actor.id) throw new AppError("FORBIDDEN");
  const me = ctx.actor.id;
  const profile = await verifyLineIdToken({ idToken: input.idToken, loginChannelId: process.env.PLATFORM_LINE_LOGIN_CHANNEL_ID ?? "" });
  if (!profile) throw new AppError("LINE_TOKEN_INVALID");
  await withTx(ctx, async (tx) => {
    // line_user_id is unique across all staff, so the clash check spans organizations (no tenant key needed to read it)
    const [taken] = await tx
      .select({ id: staffUser.id })
      .from(staffUser)
      .where(and(eq(staffUser.lineUserId, profile.sub), ne(staffUser.id, me)))
      .limit(1);
    if (taken) throw new AppError("EMAIL_TAKEN");
    const [updated] = await tenantDb(ctx, tx).update(staffUser, { lineUserId: profile.sub, updatedAt: ctx.now }, eq(staffUser.id, me));
    if (!updated) throw new AppError("NOT_FOUND");
  });
  return authMe(ctx, {});
}
