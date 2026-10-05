import type { StaffUserItem, StaffUserPublicItem } from "@app/contracts/dto/staff-user-item";
import type { StaffUsersListRequest, StaffUsersListResponse } from "@app/contracts/endpoints/staffUsers.list";
import { staffUser, staffWorkingHours } from "@app/db/schema";
import { asc, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { signedUrl } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";

type StaffRow = typeof staffUser.$inferSelect;
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** 05#dto-StaffUserItem for org-checked rows (working hours of every branch, by weekday then start) */
export async function staffUserItems(ctx: RequestContext, db: Executor, rows: StaffRow[]): Promise<StaffUserItem[]> {
  if (rows.length === 0) return [];
  const hours = (await tenantDb(ctx, db)
    .select(
      staffWorkingHours,
      inArray(
        staffWorkingHours.staffUserId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(staffWorkingHours.weekday), asc(staffWorkingHours.startsAt))) as (typeof staffWorkingHours.$inferSelect)[];
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      displayName: r.displayName,
      email: r.email,
      phone: r.phone,
      role: r.role,
      isGroomer: r.isGroomer,
      status: r.status,
      sortOrder: r.sortOrder,
      photoUrl: r.photoFileId ? await signedUrl(db, ctx, r.photoFileId) : null,
      lineLinked: r.lineUserId !== null,
      lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
      workingHours: hours
        .filter((h) => h.staffUserId === r.id)
        .map((h) => ({
          weekday: h.weekday,
          startsAt: h.startsAt.slice(0, 5),
          endsAt: h.endsAt.slice(0, 5),
          breakStartsAt: hhmm(h.breakStartsAt),
          breakEndsAt: hhmm(h.breakEndsAt),
        })),
    })),
  );
}

/** 05#ep-staffUsers.list: everyone of the organization by sort order then name; role staff sees only id/name/groomer/photo */
export async function staffUsersList(ctx: RequestContext, _input: StaffUsersListRequest): Promise<StaffUsersListResponse> {
  requireRole(ctx, "staffUsers.list");
  const db = getDb();
  const rows = (await tenantDb(ctx, db)
    .select(staffUser)
    .orderBy(asc(staffUser.sortOrder), asc(staffUser.displayName), asc(staffUser.id))) as StaffRow[];
  const items = await staffUserItems(ctx, db, rows);
  if (ctx.actor.role !== "staff") return items;
  return items.map(({ id, displayName, isGroomer, photoUrl }): StaffUserPublicItem => ({ id, displayName, isGroomer, photoUrl }));
}
