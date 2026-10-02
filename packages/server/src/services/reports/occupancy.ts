import type { ReportsOccupancyRequest, ReportsOccupancyResponse } from "@app/contracts/endpoints/reports.occupancy";
import { branch, roomType, roomUnit, stay } from "@app/db/schema";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

const OCCUPYING = ["checked_in", "checked_out"] as const;
const DAY_MS = 86_400_000;

const percent = (occupied: number, total: number) => (total === 0 ? 0 : Math.round((occupied * 100) / total));

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Hotel occupancy of the session branch per local night from..to (05#dto-OccupancyReport, Q-0031). */
export async function reportsOccupancy(ctx: RequestContext, input: ReportsOccupancyRequest): Promise<ReportsOccupancyResponse> {
  requireRole(ctx, "reports.occupancy");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = tenantDb(ctx, getDb());
  const [scopedBranch] = (await db.select(branch, eq(branch.id, ctx.branchId))) as (typeof branch.$inferSelect)[];
  if (!scopedBranch) throw new AppError("NOT_FOUND");

  const units = (await db.select(
    roomUnit,
    and(eq(roomUnit.branchId, scopedBranch.id), eq(roomUnit.status, "active")),
  )) as (typeof roomUnit.$inferSelect)[];
  // a stay occupies night d when check_in_date ≤ d < check_out_date
  const stays = (await db.select(
    stay,
    and(
      eq(stay.branchId, scopedBranch.id),
      inArray(stay.status, [...OCCUPYING]),
      lte(stay.checkInDate, input.to),
      gt(stay.checkOutDate, input.from),
    ),
  )) as (typeof stay.$inferSelect)[];
  const types = (await db.select(roomType, eq(roomType.branchId, scopedBranch.id))) as (typeof roomType.$inferSelect)[];

  const dates = datesBetween(input.from, input.to);
  const occupiedByType = new Map<string, number>();
  const days = dates.map((date) => {
    const unitType = new Map<string, string>();
    for (const s of stays) if (s.checkInDate <= date && date < s.checkOutDate) unitType.set(s.roomUnitId, s.roomTypeId);
    for (const typeId of unitType.values()) occupiedByType.set(typeId, (occupiedByType.get(typeId) ?? 0) + 1);
    return { date, occupiedUnits: unitType.size, totalUnits: units.length, percent: percent(unitType.size, units.length) };
  });

  const activeUnitsByType = new Map<string, number>();
  for (const u of units) activeUnitsByType.set(u.roomTypeId, (activeUnitsByType.get(u.roomTypeId) ?? 0) + 1);
  const byRoomType = types
    .filter((t) => activeUnitsByType.has(t.id) || occupiedByType.has(t.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameTh.localeCompare(b.nameTh) || a.id.localeCompare(b.id))
    .map((t) => {
      const occupiedNights = occupiedByType.get(t.id) ?? 0;
      const totalNights = (activeUnitsByType.get(t.id) ?? 0) * dates.length;
      return { roomTypeId: t.id, roomTypeName: t.nameTh, occupiedNights, totalNights, percent: percent(occupiedNights, totalNights) };
    });

  return { from: input.from, to: input.to, days, byRoomType };
}
