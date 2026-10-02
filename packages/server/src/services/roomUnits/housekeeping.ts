import type { RoomUnitsHousekeepingRequest, RoomUnitsHousekeepingResponse } from "@app/contracts/endpoints/roomUnits.housekeeping";
import { roomUnit } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { roomUnitItem } from "./list.ts";

export async function roomUnitsHousekeeping(
  ctx: RequestContext,
  input: RoomUnitsHousekeepingRequest & { roomUnitId: string },
): Promise<RoomUnitsHousekeepingResponse> {
  requireRole(ctx, "roomUnits.housekeeping");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const branchId = ctx.branchId;
  return withTx(ctx, async (tx) => {
    const [row] = (await tenantDb(ctx, tx).update(
      roomUnit,
      { housekeeping: input.housekeeping, updatedAt: ctx.now },
      and(eq(roomUnit.id, input.roomUnitId), eq(roomUnit.branchId, branchId)),
    )) as (typeof roomUnit.$inferSelect)[];
    if (!row) throw new AppError("NOT_FOUND");
    return roomUnitItem(row);
  });
}
