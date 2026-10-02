import type { AuthMeRequest, AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import type { StaffRole } from "@app/contracts/enums";
import { branch, organization, platformAdmin, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { PERMISSIONS, requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export async function authMe(ctx: RequestContext, _input: AuthMeRequest): Promise<AuthMeResponse> {
  const supportMode = ctx.supportAccessLogId !== null;
  if (ctx.actor.type === "staff") requireRole(ctx, "auth.me");
  else if (ctx.actor.type !== "admin" || !supportMode) throw new AppError("FORBIDDEN");
  if (!ctx.orgId || !ctx.branchId || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const db = getDb();
  const tenant = tenantDb(ctx, db);
  const [org] = await db.select().from(organization).where(eq(organization.id, ctx.orgId));
  const [shop] = (await tenant.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!org || !shop) throw new AppError("NOT_FOUND");

  let staff: AuthMeResponse["staff"];
  if (supportMode && ctx.actor.type === "admin") {
    const [admin] = await db.select().from(platformAdmin).where(eq(platformAdmin.id, ctx.actor.id));
    if (!admin) throw new AppError("NOT_FOUND");
    staff = { id: admin.id, displayName: admin.displayName, email: admin.email, role: "owner", isGroomer: false, lineLinked: false };
  } else {
    const [row] = (await tenant.select(staffUser, eq(staffUser.id, ctx.actor.id))) as (typeof staffUser.$inferSelect)[];
    if (!row) throw new AppError("NOT_FOUND");
    staff = {
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      role: row.role,
      isGroomer: row.isGroomer,
      lineLinked: row.lineUserId !== null,
    };
  }
  return {
    staff,
    organization: { id: org.id, name: org.name, status: org.status },
    branch: {
      id: shop.id,
      name: shop.name,
      bookingSlug: shop.bookingSlug,
      timezone: shop.timezone,
      modules: { grooming: shop.moduleGrooming, hotel: shop.moduleHotel, daycare: shop.moduleDaycare },
    },
    permissions: (Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>).filter((key) =>
      (PERMISSIONS[key] as readonly StaffRole[]).includes(staff.role),
    ),
    supportMode,
  };
}
