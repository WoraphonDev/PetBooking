import { randomBytes } from "node:crypto";
import type { StaffUsersInviteRequest, StaffUsersInviteResponse } from "@app/contracts/endpoints/staffUsers.invite";
import { organization, staffInvite, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import { hashToken } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError, mapPgError } from "../../errors.ts";
import { enqueueNotification } from "../../notify/enqueue.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { staffUserItems } from "./list.ts";

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

/**
 * 05#ep-staffUsers.invite: staff_user (status invited) + staff_invite valid 7 days (token hashed, as staffUsers.resendInvite),
 * audit staff.invite; with an email, staff.invite {shopName, inviteUrl} by email. inviteUrl is always returned (for LINE).
 * A taken email → EMAIL_TAKEN (staff_user_email_uq).
 */
export async function staffUsersInvite(ctx: RequestContext, input: StaffUsersInviteRequest): Promise<StaffUsersInviteResponse> {
  requireRole(ctx, "staffUsers.invite");
  const createdBy = ctx.actor.id;
  if (!createdBy || !ctx.orgId) throw new AppError("FORBIDDEN");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [row] = (await db.insert(staffUser, {
      email: input.email ?? null,
      displayName: input.displayName,
      role: input.role,
      isGroomer: input.isGroomer,
      status: "invited",
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof staffUser.$inferSelect)[];
    if (!row) throw new Error("staffUsers.invite: no inserted staff_user");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(ctx.now.getTime() + INVITE_TTL_MS);
    const [invite] = (await db.insert(staffInvite, {
      staffUserId: row.id,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy,
      createdAt: ctx.now,
    })) as (typeof staffInvite.$inferSelect)[];
    if (!invite) throw new Error("staffUsers.invite: no inserted invite");
    await writeAudit(tx, ctx, {
      action: "staff.invite",
      entityType: "staff_invite",
      entityId: invite.id,
      after: { staffUserId: row.id, role: row.role, expiresAt: expiresAt.toISOString() },
    });
    const inviteUrl = new URL(`/invite/${token}`, process.env.APP_BASE_URL).toString();
    if (row.email) {
      // organization is a platform table; the org is the session's own
      const [org] = await tx
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, ctx.orgId as string));
      await enqueueNotification(tx, ctx, {
        key: "staff.invite",
        recipient: { type: "staff", id: row.id },
        payload: { shopName: org?.name ?? "", inviteUrl },
        dedupeKey: `invite:${invite.id}`,
      });
    }
    const [item] = await staffUserItems(ctx, tx, [row]);
    if (!item) throw new Error("staffUsers.invite: no item");
    return { staffUser: item, inviteUrl };
  }).catch((error: unknown) => {
    throw error instanceof AppError ? error : mapPgError(error);
  });
}
