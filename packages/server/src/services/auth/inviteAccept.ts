import type { AuthInviteAcceptRequest, AuthInviteAcceptResponse } from "@app/contracts/endpoints/auth.inviteAccept";
import type { StaffRole } from "@app/contracts/enums";
import { branch, consentRecord, organization, staffInvite, staffUser } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";
import { sessionCookie } from "../../auth/cookies.ts";
import { hashNewPassword } from "../../auth/password.ts";
import { PERMISSIONS } from "../../auth/permissions.ts";
import { createSession, hashToken } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError, mapPgError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";

/** Shop-side legal documents an owner accepts with the invite (05#ep-admin.createOrg, Q-0023). */
const OWNER_CONSENT_DOCS = ["dpa", "terms_of_service"] as const;

export async function authInviteAccept(
  ctx: RequestContext,
  input: AuthInviteAcceptRequest,
  http: HttpExtras,
): Promise<AuthInviteAcceptResponse> {
  try {
    return await withTx(ctx, async (tx) => {
      // The public token identifies the invite; resolve its tenant before scoped access.
      const tokenHash = hashToken(input.token);
      const [identity] = await tx
        .select({ organizationId: staffInvite.organizationId })
        .from(staffInvite)
        .where(eq(staffInvite.tokenHash, tokenHash));
      if (!identity) throw new AppError("TOKEN_INVALID");
      const scopedCtx = { ...ctx, orgId: identity.organizationId };
      const db = tenantDb(scopedCtx, tx);
      const [invite] = (await db
        .select(staffInvite, eq(staffInvite.tokenHash, tokenHash))
        .for("update")) as (typeof staffInvite.$inferSelect)[];
      if (!invite || invite.acceptedAt !== null || invite.expiresAt.getTime() <= ctx.now.getTime()) throw new AppError("TOKEN_INVALID");
      const [staff] = (await db.select(staffUser, eq(staffUser.id, invite.staffUserId))) as (typeof staffUser.$inferSelect)[];
      if (!staff) throw new AppError("TOKEN_INVALID");
      // 05: staff_user invited → active only (the state table also allows disabled → active, which an old invite must not do)
      if (staff.status !== "invited") throw new AppError("INVALID_TRANSITION");

      // email is required only when the invite has none; an invite's own email is kept
      const email = staff.email ?? input.email ?? null;
      if (!email) throw new AppError("VALIDATION_FAILED", { field: "email" });
      const passwordHash = input.password === undefined ? null : await hashNewPassword(input.password, email);

      const updated = (await transition(tx, scopedCtx, {
        table: staffUser,
        id: staff.id,
        machine: "staff_user",
        to: "active",
        extraSet: { displayName: input.displayName, email, passwordHash },
      })) as typeof staffUser.$inferSelect;
      await db.update(staffInvite, { acceptedAt: ctx.now }, eq(staffInvite.id, invite.id));

      if (updated.role === "owner") {
        await tx.insert(consentRecord).values(
          OWNER_CONSENT_DOCS.map((document) => ({
            subjectType: "organization" as const,
            subjectId: updated.organizationId,
            organizationId: updated.organizationId,
            document,
            version: referenceData.legalDocs[document].version,
            accepted: true,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            createdAt: ctx.now,
          })),
        );
      }

      const [org] = await tx.select().from(organization).where(eq(organization.id, updated.organizationId));
      const [shop] = (await db.select(branch).orderBy(asc(branch.createdAt)).limit(1)) as (typeof branch.$inferSelect)[];
      if (!org || !shop) throw new Error("Invite acceptance requires an organization and branch");
      const created = await createSession(
        tx,
        { subjectType: "staff", subjectId: updated.id, organizationId: org.id, branchId: shop.id, ip: ctx.ip, userAgent: ctx.userAgent },
        ctx.now,
      );
      http.setCookie(sessionCookie("staff", created.token, created.session.expiresAt));

      return {
        staff: {
          id: updated.id,
          displayName: updated.displayName,
          email: updated.email,
          role: updated.role,
          isGroomer: updated.isGroomer,
          lineLinked: updated.lineUserId !== null,
        },
        organization: { id: org.id, name: org.name, status: org.status },
        branch: {
          id: shop.id,
          name: shop.name,
          bookingSlug: shop.bookingSlug,
          timezone: shop.timezone,
          modules: { grooming: shop.moduleGrooming, hotel: shop.moduleHotel, daycare: shop.moduleDaycare },
        },
        permissions: (Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>).filter((key) =>
          (PERMISSIONS[key] as readonly StaffRole[]).includes(updated.role),
        ),
        supportMode: false,
      };
    });
  } catch (e) {
    // staff_user_email_uq → EMAIL_TAKEN (02 §13)
    throw mapPgError(e);
  }
}
