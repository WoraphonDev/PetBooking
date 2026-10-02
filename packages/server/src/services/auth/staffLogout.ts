import type { AuthStaffLogoutRequest, AuthStaffLogoutResponse } from "@app/contracts/endpoints/auth.staffLogout";
import { session } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { clearSessionCookie } from "../../auth/cookies.ts";
import { revokeSession } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function authStaffLogout(
  ctx: RequestContext,
  _input: AuthStaffLogoutRequest,
  http: HttpExtras,
): Promise<AuthStaffLogoutResponse> {
  const current = http.session;
  if (!current) throw new AppError("UNAUTHENTICATED");
  if (ctx.actor.type !== "staff") throw new AppError("FORBIDDEN");
  await withTx(ctx, async (tx) => {
    const where = and(eq(session.id, current.id), eq(session.subjectType, "staff"), eq(session.subjectId, ctx.actor.id ?? ""));
    const [scoped] = await tenantDb(ctx, tx).select(session, where);
    if (!scoped) throw new AppError("NOT_FOUND");
    await revokeSession(tx, current.id);
  });
  http.setCookie(clearSessionCookie("staff"));
}
