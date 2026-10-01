import type { AuthStaffLoginRequest, AuthStaffLoginResponse } from "@app/contracts/endpoints/auth.staffLogin";
import type { StaffRole } from "@app/contracts/enums";
import { branch, organization, staffUser } from "@app/db/schema";
import { eq, sql } from "drizzle-orm";
import { sessionCookie } from "../../auth/cookies.ts";
import { verifyStaffLogin, verifyUnknownUserPassword } from "../../auth/password.ts";
import { PERMISSIONS } from "../../auth/permissions.ts";
import { createSession } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import type { HttpExtras } from "../../http/wrap.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function authStaffLogin(ctx: RequestContext, input: AuthStaffLoginRequest, http: HttpExtras): Promise<AuthStaffLoginResponse> {
  // Email is globally unique; this identity lookup obtains the tenant key before tenantDb can scope the row.
  const [identity] = await getDb()
    .select({ organizationId: staffUser.organizationId })
    .from(staffUser)
    .where(sql`lower(${staffUser.email}) = ${input.email}`)
    .limit(1);

  if (!identity) {
    await verifyUnknownUserPassword(input.password);
    throw new AppError("INVALID_CREDENTIALS");
  }

  const scopedCtx = { ...ctx, orgId: identity.organizationId };
  const result = await withTx(ctx, async (tx) => {
    const [staffRow] = await tenantDb(scopedCtx, tx).select(staffUser, eq(staffUser.email, input.email));
    const staff = staffRow as typeof staffUser.$inferSelect | undefined;
    if (staff?.status !== "active" || !staff.email || !staff.passwordHash) {
      await verifyUnknownUserPassword(input.password);
      return { error: "INVALID_CREDENTIALS" as const };
    }

    const verified = await verifyStaffLogin(tx, staff, input.password, ctx.now);
    if (!verified.ok) return { error: verified.error || "INVALID_CREDENTIALS" };

    const [org] = await tx.select().from(organization).where(eq(organization.id, staff.organizationId));
    const [branchRow] = await tenantDb(scopedCtx, tx).select(branch);
    const shopBranch = branchRow as typeof branch.$inferSelect | undefined;
    if (!org || !shopBranch) throw new Error("Staff login requires an organization and branch");

    const created = await createSession(
      tx,
      {
        subjectType: "staff",
        subjectId: staff.id,
        organizationId: staff.organizationId,
        branchId: shopBranch.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      ctx.now,
    );
    http.setCookie(sessionCookie("staff", created.token, created.session.expiresAt));

    return {
      response: {
        staff: {
          id: staff.id,
          displayName: staff.displayName,
          email: staff.email,
          role: staff.role,
          isGroomer: staff.isGroomer,
          lineLinked: staff.lineUserId !== null,
        },
        organization: { id: org.id, name: org.name, status: org.status },
        branch: {
          id: shopBranch.id,
          name: shopBranch.name,
          bookingSlug: shopBranch.bookingSlug,
          timezone: shopBranch.timezone,
          modules: {
            grooming: shopBranch.moduleGrooming,
            hotel: shopBranch.moduleHotel,
            daycare: shopBranch.moduleDaycare,
          },
        },
        permissions: (Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>).filter((key) =>
          (PERMISSIONS[key] as readonly StaffRole[]).includes(staff.role),
        ),
        supportMode: false,
      },
    };
  });

  if ("error" in result) throw new AppError(result.error ?? "INVALID_CREDENTIALS");
  return result.response;
}
