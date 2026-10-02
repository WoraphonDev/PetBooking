import type { TimeOffItem, TimeOffListRequest, TimeOffListResponse } from "@app/contracts/endpoints/timeOff.list";
import { staffTimeOff } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, asc, gt, lt } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";

function timeOffItem(row: typeof staffTimeOff.$inferSelect): TimeOffItem {
  return {
    id: row.id,
    organizationId: row.organizationId,
    staffUserId: row.staffUserId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Time off of the organization overlapping the local days from..to (inclusive, R-20). */
export async function timeOffList(ctx: RequestContext, input: TimeOffListRequest): Promise<TimeOffListResponse> {
  requireRole(ctx, "timeOff.list");
  const { start } = localDayBounds({ date: input.from, timezone: ctx.timezone });
  const { end } = localDayBounds({ date: input.to, timezone: ctx.timezone });
  const rows = (await tenantDb(ctx, getDb())
    .select(staffTimeOff, and(gt(staffTimeOff.endsAt, new Date(start)), lt(staffTimeOff.startsAt, new Date(end))))
    .orderBy(asc(staffTimeOff.startsAt), asc(staffTimeOff.id))) as (typeof staffTimeOff.$inferSelect)[];
  return rows.map(timeOffItem);
}
