import { randomBytes } from "node:crypto";
import type { AuthResetRequestRequest, AuthResetRequestResponse } from "@app/contracts/endpoints/auth.resetRequest";
import { branch, passwordReset, staffUser } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { hashToken } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function authResetRequest(ctx: RequestContext, input: AuthResetRequestRequest): Promise<AuthResetRequestResponse> {
  // Globally unique email identifies the tenant before tenantDb can scope the account.
  const [identity] = await getDb()
    .select({ organizationId: staffUser.organizationId })
    .from(staffUser)
    .where(eq(staffUser.email, input.email));
  if (!identity) return;
  await withTx(ctx, async (tx) => {
    const scopedCtx = { ...ctx, orgId: identity.organizationId };
    const db = tenantDb(scopedCtx, tx);
    const [staff] = (await db.select(staffUser, eq(staffUser.email, input.email))) as (typeof staffUser.$inferSelect)[];
    if (!staff) return;
    const [shop] = (await db.select(branch).orderBy(asc(branch.createdAt)).limit(1)) as (typeof branch.$inferSelect)[];
    const token = randomBytes(32).toString("base64url");
    const [reset] = await tx
      .insert(passwordReset)
      .values({
        staffUserId: staff.id,
        tokenHash: hashToken(token),
        createdAt: ctx.now,
        expiresAt: new Date(ctx.now.getTime() + 30 * 60_000),
      })
      .returning();
    if (!reset) throw new Error("Password reset insert returned no row");
    const resetUrl = new URL("/reset-password", process.env.APP_BASE_URL);
    resetUrl.searchParams.set("token", token);
    await enqueueNotification(
      tx,
      { ...scopedCtx, branchId: shop?.id ?? null, timezone: shop?.timezone ?? ctx.timezone },
      {
        key: "staff.password_reset",
        recipient: { type: "staff", id: staff.id },
        payload: { resetUrl: resetUrl.toString() },
        dedupeKey: `pwreset:${reset.id}`,
      },
    );
  });
}
