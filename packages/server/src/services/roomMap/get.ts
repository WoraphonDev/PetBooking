import type { StayCard } from "@app/contracts/dto/stay-card";
import type { RoomMapGetRequest, RoomMapGetResponse } from "@app/contracts/endpoints/roomMap.get";
import { roomType, roomUnit, stay } from "@app/db/schema";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { bookingDetail } from "../bookings/get.ts";

type StayRow = typeof stay.$inferSelect;
/** stays still holding their room (cancelled / no-show free it) */
const HOLDING = ["reserved", "checked_in", "checked_out"] as const;

/**
 * 05#ep-roomMap.get / dto-RoomMap for the session branch on `date`, units by sort_order then code. occupant = the stay in the
 * room that night (reserved/checked_in with check_in_date ≤ date < check_out_date), else a pet still checked in on its
 * check-out day. arrivingToday / departingToday = a holding stay with check_in_date / check_out_date = date;
 * nextArrivalDate = the earliest reserved check_in_date after date.
 */
export async function roomMapGet(ctx: RequestContext, input: RoomMapGetRequest): Promise<RoomMapGetResponse> {
  requireRole(ctx, "roomMap.get");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const repo = tenantDb(ctx, db);
  const units = (await repo
    .select(roomUnit, eq(roomUnit.branchId, ctx.branchId))
    .orderBy(asc(roomUnit.sortOrder), asc(roomUnit.code))) as (typeof roomUnit.$inferSelect)[];
  if (units.length === 0) return { date: input.date, units: [] };
  const types = (await repo.select(roomType, eq(roomType.branchId, ctx.branchId))) as (typeof roomType.$inferSelect)[];
  // everything that touches date or arrives later
  const stays = (await repo.select(
    stay,
    and(
      inArray(
        stay.roomUnitId,
        units.map((u) => u.id),
      ),
      inArray(stay.status, [...HOLDING]),
      gte(stay.checkOutDate, input.date),
    ),
  )) as StayRow[];
  const inRoom = (s: StayRow) =>
    (s.status !== "checked_out" && s.checkInDate <= input.date && input.date < s.checkOutDate) ||
    (s.status === "checked_in" && s.checkOutDate === input.date);
  const occupants = new Map<string, StayRow>();
  for (const s of stays.filter(inRoom).sort((a, b) => Number(b.status === "checked_in") - Number(a.status === "checked_in")))
    if (s.roomUnitId && !occupants.has(s.roomUnitId)) occupants.set(s.roomUnitId, s);

  const cards = new Map<string, StayCard>();
  for (const bookingId of new Set([...occupants.values()].map((s) => s.bookingId)))
    for (const card of (await bookingDetail(ctx, db, bookingId)).stays) cards.set(card.id, card);

  return {
    date: input.date,
    units: units.map((u) => {
      const mine = stays.filter((s) => s.roomUnitId === u.id);
      const occupant = occupants.get(u.id);
      const next = mine
        .filter((s) => s.status === "reserved" && s.checkInDate > input.date)
        .map((s) => s.checkInDate)
        .sort()[0];
      return {
        id: u.id,
        code: u.code,
        zone: u.zone,
        roomTypeName: types.find((t) => t.id === u.roomTypeId)?.nameTh ?? "",
        status: u.status,
        housekeeping: u.housekeeping,
        occupant: occupant ? (cards.get(occupant.id) ?? null) : null,
        arrivingToday: mine.some((s) => s.checkInDate === input.date),
        departingToday: mine.some((s) => s.checkOutDate === input.date),
        nextArrivalDate: next ?? null,
      };
    }),
  };
}
