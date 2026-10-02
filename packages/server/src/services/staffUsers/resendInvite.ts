import { randomBytes } from "node:crypto";
import type { StaffUsersResendInviteRequest, StaffUsersResendInviteResponse } from "@app/contracts/endpoints/staffUsers.resendInvite";
import { staffInvite, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import { hashToken } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError, mapPgError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export async function staffUsersResendInvite(
  ctx: RequestContext,
  input: StaffUsersResendInviteRequest,
): Promise<StaffUsersResendInviteResponse> {
  requireRole(ctx, "staffUsers.resendInvite");
  const createdBy = ctx.actor.id;
  if (!createdBy) throw new AppError("FORBIDDEN");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [staff] = await db.select(staffUser, eq(staffUser.id, input.staffUserId));
    if (!staff) throw new AppError("NOT_FOUND");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(ctx.now.getTime() + INVITE_TTL_MS);
    // Insert only: existing invitation hashes, acceptance state and expiry remain unchanged.
    const [invite] = (await db.insert(staffInvite, {
      staffUserId: input.staffUserId,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy,
      createdAt: ctx.now,
    })) as (typeof staffInvite.$inferSelect)[];
    if (!invite) throw new Error("Staff invite insert returned no row");
    await writeAudit(tx, ctx, {
      action: "staff.invite",
      entityType: "staff_invite",
      entityId: invite.id,
      after: { staffUserId: input.staffUserId, expiresAt: expiresAt.toISOString() },
    });
    return { inviteUrl: new URL(`/invite/${token}`, process.env.APP_BASE_URL).toString() };
  }).catch((error: unknown) => {
    throw mapPgError(error);
  });
}
