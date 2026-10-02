import type { RoomUnitsUpsertRequest, RoomUnitsUpsertResponse } from "@app/contracts/endpoints/roomUnits.upsert";
import { branch, roomType, roomUnit, stay } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { branchRoomUnits } from "./list.ts";

/** stays that still need their room (05: "การพักอนาคต") */
const OPEN_STAY = ["reserved", "checked_in"] as const;

/** Creates (no id) or updates (id) the given units; units not sent are left as they are (archive via status). */
export async function roomUnitsUpsert(ctx: RequestContext, input: RoomUnitsUpsertRequest): Promise<RoomUnitsUpsertResponse> {
  requireRole(ctx, "roomUnits.upsert");
  const branchId = ctx.branchId;
  if (!branchId) throw new AppError("NOT_FOUND");
  return withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [scopedBranch] = await db.select(branch, eq(branch.id, branchId));
    if (!scopedBranch) throw new AppError("NOT_FOUND");

    const existing = (await db.select(roomUnit, eq(roomUnit.branchId, branchId))) as (typeof roomUnit.$inferSelect)[];
    const byId = new Map(existing.map((u) => [u.id, u]));
    if (input.units.some((u) => u.id && !byId.has(u.id))) throw new AppError("NOT_FOUND");
    const typeIds = [...new Set(input.units.map((u) => u.roomTypeId))];
    if (typeIds.length) {
      const types = await db.select(roomType, and(eq(roomType.branchId, branchId), inArray(roomType.id, typeIds)));
      if (types.length !== typeIds.length) throw new AppError("NOT_FOUND");
    }

    // 05: code unique in the branch — against the request and the units not being sent
    const sentIds = new Set(input.units.flatMap((u) => (u.id ? [u.id] : [])));
    const taken = new Set(existing.filter((u) => !sentIds.has(u.id)).map((u) => u.code));
    const codes = new Set<string>();
    for (const u of input.units) {
      if (taken.has(u.code) || codes.has(u.code)) throw new AppError("CODE_TAKEN");
      codes.add(u.code);
    }

    // 05: maintenance/archived is refused while a reserved or checked-in stay still needs the room
    const closing = input.units.flatMap((u) => (u.id && u.status !== "active" ? [u.id] : []));
    if (closing.length) {
      const [open] = await db.select(stay, and(inArray(stay.roomUnitId, closing), inArray(stay.status, [...OPEN_STAY]))).limit(1);
      if (open) throw new AppError("IN_USE");
    }

    // kept units first get a temporary code so swapped codes don't hit the (branch_id, code) unique index
    const kept = input.units.filter((u) => u.id && byId.get(u.id)?.code !== u.code);
    for (const u of kept) await db.update(roomUnit, { code: `~${u.id}` }, eq(roomUnit.id, u.id ?? ""));
    for (const { id, ...u } of input.units) {
      const values = { ...u, zone: u.zone || null, updatedAt: ctx.now };
      if (id) await db.update(roomUnit, values, eq(roomUnit.id, id));
      else await db.insert(roomUnit, { ...values, branchId, createdAt: ctx.now });
    }
    return branchRoomUnits(ctx, tx, branchId);
  });
}
