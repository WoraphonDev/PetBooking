import type { StaffMeRevokeSessionRequest, StaffMeRevokeSessionResponse } from "@app/contracts/endpoints/staffMe.revokeSession";
import { session } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { clearSessionCookie } from "../../auth/cookies.ts";
import { revokeSession } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** sign out one of the caller's own devices; anyone else's session (or another org's) is NOT_FOUND */
export async function staffMeRevokeSession(
  ctx: RequestContext,
  input: StaffMeRevokeSessionRequest & { sessionId: string },
  http: HttpExtras,
): Promise<StaffMeRevokeSessionResponse> {
  if (ctx.actor.type !== "staff" || !ctx.actor.id) throw new AppError("FORBIDDEN");
  const actorId = ctx.actor.id;
  await withTx(ctx, async (tx) => {
    const where = and(eq(session.id, input.sessionId), eq(session.subjectType, "staff"), eq(session.subjectId, actorId));
    const [own] = await tenantDb(ctx, tx).select(session, where);
    if (!own) throw new AppError("NOT_FOUND");
    await revokeSession(tx, input.sessionId);
  });
  // revoking this very device also clears its cookie
  if (http.session?.id === input.sessionId) http.setCookie(clearSessionCookie("staff"));
}
