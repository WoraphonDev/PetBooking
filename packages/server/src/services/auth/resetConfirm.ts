import type { AuthResetConfirmRequest, AuthResetConfirmResponse } from "@app/contracts/endpoints/auth.resetConfirm";
import { passwordReset, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { hashNewPassword } from "../../auth/password.ts";
import { hashToken, revokeAllFor } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function authResetConfirm(ctx: RequestContext, input: AuthResetConfirmRequest): Promise<AuthResetConfirmResponse> {
  await withTx(ctx, async (tx) => {
    // Lock the single-use token so concurrent confirmations cannot both succeed.
    const [reset] = await tx
      .select()
      .from(passwordReset)
      .where(eq(passwordReset.tokenHash, hashToken(input.token)))
      .for("update");
    if (!reset || reset.usedAt !== null || reset.expiresAt.getTime() <= ctx.now.getTime()) throw new AppError("TOKEN_INVALID");

    // The public token identifies the staff member; resolve its tenant before scoped access.
    const [identity] = await tx
      .select({ organizationId: staffUser.organizationId })
      .from(staffUser)
      .where(eq(staffUser.id, reset.staffUserId));
    if (!identity) throw new AppError("TOKEN_INVALID");
    const db = tenantDb({ ...ctx, orgId: identity.organizationId }, tx);
    const [row] = await db.select(staffUser, eq(staffUser.id, reset.staffUserId));
    const staff = row as typeof staffUser.$inferSelect | undefined;
    if (!staff) throw new AppError("TOKEN_INVALID");
    const passwordHash = await hashNewPassword(input.newPassword, staff.email);
    await db.update(staffUser, { passwordHash, updatedAt: ctx.now }, eq(staffUser.id, staff.id));
    await tx.update(passwordReset).set({ usedAt: ctx.now }).where(eq(passwordReset.id, reset.id));
    await revokeAllFor(tx, { type: "staff", id: staff.id });
  });
}
