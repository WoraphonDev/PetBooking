import type { AdminLoginRequest, AdminLoginResponse } from "@app/contracts/endpoints/admin.login";
import { platformAdmin } from "@app/db/schema";
import { loginAttempt } from "@app/domain/auth/lockout";
import { eq } from "drizzle-orm";
import { sessionCookie } from "../../auth/cookies.ts";
import { verifyPassword, verifyUnknownUserPassword } from "../../auth/password.ts";
import { createSession } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";

export async function adminLogin(ctx: RequestContext, input: AdminLoginRequest, http: HttpExtras): Promise<AdminLoginResponse> {
  const result = await withTx(ctx, async (tx) => {
    // Platform identities have no tenant key. Lock the row so concurrent failures cannot lose counts.
    const [admin] = await tx.select().from(platformAdmin).where(eq(platformAdmin.email, input.email)).for("update");
    if (admin?.status !== "active") {
      await verifyUnknownUserPassword(input.password);
      return { error: "INVALID_CREDENTIALS" as const };
    }
    const locked = admin.lockedUntil !== null && ctx.now.getTime() < admin.lockedUntil.getTime();
    const attempt = loginAttempt({
      now: ctx.now.toISOString(),
      failedLoginCount: admin.failedLoginCount,
      lockedUntil: admin.lockedUntil?.toISOString() ?? null,
      passwordCorrect: !locked && (await verifyPassword(admin.passwordHash, input.password)),
    });
    await tx
      .update(platformAdmin)
      .set({
        failedLoginCount: attempt.failedLoginCount,
        lockedUntil: attempt.lockedUntil === null ? null : new Date(attempt.lockedUntil),
        updatedAt: ctx.now,
      })
      .where(eq(platformAdmin.id, admin.id));
    if (!attempt.allowed) return { error: attempt.error ?? "INVALID_CREDENTIALS" };
    const created = await createSession(
      tx,
      { subjectType: "platform_admin", subjectId: admin.id, ip: ctx.ip, userAgent: ctx.userAgent },
      ctx.now,
    );
    return { created, response: { admin: { id: admin.id, email: admin.email, displayName: admin.displayName } } };
  });
  // Commit failures before returning their error; emit the cookie only after the session transaction commits.
  if ("error" in result) throw new AppError(result.error ?? "INVALID_CREDENTIALS");
  http.setCookie(sessionCookie("platform_admin", result.created.token, result.created.session.expiresAt));
  return result.response;
}
