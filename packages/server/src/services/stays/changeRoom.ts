import type { StaysChangeRoomRequest, StaysChangeRoomResponse } from "@app/contracts/endpoints/stays.changeRoom";
import { roomUnit, stay } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError, mapPgError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { bookingDetail } from "../bookings/get.ts";

/**
 * 05#ep-stays.changeRoom: a reserved / checked_in stay (others → STATUS_NOT_ALLOWED) moves to an active room of the same
 * branch and room type; the price snapshot stays. The stay_room_no_overlap constraint answers ROOM_TAKEN. A room of another
 * type needs keepPrice / repriceToType, which 05 does not list as request fields → VALIDATION_FAILED until Q-0110 is answered.
 */
export async function staysChangeRoom(
  ctx: RequestContext,
  input: StaysChangeRoomRequest & { stayId: string },
): Promise<StaysChangeRoomResponse> {
  requireRole(ctx, "stays.changeRoom");
  let bookingId: string;
  try {
    bookingId = await withTx(ctx, async (tx) => {
      const db = tenantDb(ctx, tx);
      const [s] = (await db.select(stay, eq(stay.id, input.stayId)).for("update")) as (typeof stay.$inferSelect)[];
      if (!s) throw new AppError("NOT_FOUND");
      if (s.status !== "reserved" && s.status !== "checked_in") throw new AppError("STATUS_NOT_ALLOWED", { status: s.status });
      const [unit] = (await db.select(roomUnit, eq(roomUnit.id, input.roomUnitId))) as (typeof roomUnit.$inferSelect)[];
      if (!unit || unit.branchId !== s.branchId) throw new AppError("NOT_FOUND");
      if (unit.status !== "active") throw new AppError("VALIDATION_FAILED", { fields: { roomUnitId: "room is not active" } });
      if (unit.roomTypeId !== s.roomTypeId)
        throw new AppError("VALIDATION_FAILED", { fields: { roomUnitId: "another room type is not supported yet (Q-0110)" } });
      if (unit.id !== s.roomUnitId) await db.update(stay, { roomUnitId: unit.id, updatedAt: ctx.now }, eq(stay.id, s.id));
      return s.bookingId;
    });
  } catch (e) {
    throw e instanceof AppError ? e : mapPgError(e);
  }
  const card = (await bookingDetail(ctx, getDb(), bookingId)).stays.find((x) => x.id === input.stayId);
  if (!card) throw new AppError("NOT_FOUND");
  return card;
}
