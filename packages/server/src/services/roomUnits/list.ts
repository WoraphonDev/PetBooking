import type { RoomUnitItem } from "@app/contracts/dto/room-unit-item";
import type { RoomUnitsListRequest, RoomUnitsListResponse } from "@app/contracts/endpoints/roomUnits.list";
import { branch, roomUnit } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

export function roomUnitItem(row: typeof roomUnit.$inferSelect): RoomUnitItem {
  return {
    id: row.id,
    roomTypeId: row.roomTypeId,
    code: row.code,
    zone: row.zone,
    status: row.status,
    housekeeping: row.housekeeping,
    sortOrder: row.sortOrder,
  };
}

/** Every room unit of the branch (any status), by sort_order then code. */
export async function branchRoomUnits(ctx: RequestContext, tx: Executor, branchId: string): Promise<RoomUnitItem[]> {
  const rows = (await tenantDb(ctx, tx)
    .select(roomUnit, eq(roomUnit.branchId, branchId))
    .orderBy(asc(roomUnit.sortOrder), asc(roomUnit.code), asc(roomUnit.id))) as (typeof roomUnit.$inferSelect)[];
  return rows.map(roomUnitItem);
}

export async function roomUnitsList(ctx: RequestContext, _input: RoomUnitsListRequest): Promise<RoomUnitsListResponse> {
  requireRole(ctx, "roomUnits.list");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const [scopedBranch] = await tenantDb(ctx, db).select(branch, eq(branch.id, ctx.branchId));
  if (!scopedBranch) throw new AppError("NOT_FOUND");
  return branchRoomUnits(ctx, db, ctx.branchId);
}
