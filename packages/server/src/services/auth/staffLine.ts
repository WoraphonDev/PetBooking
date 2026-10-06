import type { AuthStaffLineRequest, AuthStaffLineResponse } from "@app/contracts/endpoints/auth.staffLine";
import { branch, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { sessionCookie } from "../../auth/cookies.ts";
import { createSession } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { verifyLineIdToken } from "../../integrations/line/idtoken.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { authMe } from "./me.ts";

/**
 * 05#ep-auth.staffLine: verify the ID token against PLATFORM_LINE_LOGIN_CHANNEL_ID (LINE_TOKEN_INVALID), find the active
 * staff_user whose line_user_id = sub (else INVALID_CREDENTIALS), open a `sid` session like auth.staffLogin, return StaffMe.
 */
export async function authStaffLine(ctx: RequestContext, input: AuthStaffLineRequest, http: HttpExtras): Promise<AuthStaffLineResponse> {
  const loginChannelId = process.env.PLATFORM_LINE_LOGIN_CHANNEL_ID ?? "";
  const profile = await verifyLineIdToken({ idToken: input.idToken, loginChannelId });
  if (!profile) throw new AppError("LINE_TOKEN_INVALID");

  // line_user_id is unique across staff: this identity lookup obtains the tenant key before tenantDb can scope the row
  const [identity] = await getDb()
    .select({ organizationId: staffUser.organizationId })
    .from(staffUser)
    .where(eq(staffUser.lineUserId, profile.sub))
    .limit(1);
  if (!identity) throw new AppError("INVALID_CREDENTIALS");

  const scoped: RequestContext = { ...ctx, orgId: identity.organizationId };
  const signedIn = await withTx(scoped, async (tx) => {
    const [staff] = (await tenantDb(scoped, tx).select(
      staffUser,
      eq(staffUser.lineUserId, profile.sub),
    )) as (typeof staffUser.$inferSelect)[];
    if (staff?.status !== "active") throw new AppError("INVALID_CREDENTIALS");
    const [shop] = (await tenantDb(scoped, tx).select(branch)) as (typeof branch.$inferSelect)[];
    if (!shop) throw new Error("Staff LINE login requires a branch");
    const created = await createSession(
      tx,
      {
        subjectType: "staff",
        subjectId: staff.id,
        organizationId: staff.organizationId,
        branchId: shop.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      ctx.now,
    );
    http.setCookie(sessionCookie("staff", created.token, created.session.expiresAt));
    return { staff, shop };
  });

  // StaffMe exactly as auth.me answers it for the new session
  return authMe(
    {
      ...scoped,
      branchId: signedIn.shop.id,
      timezone: signedIn.shop.timezone,
      actor: { type: "staff", id: signedIn.staff.id, role: signedIn.staff.role },
    },
    {},
  );
}
