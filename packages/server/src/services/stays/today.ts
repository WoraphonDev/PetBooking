import type { StayCard } from "@app/contracts/dto/stay-card";
import type { StaysTodayRequest, StaysTodayResponse } from "@app/contracts/endpoints/stays.today";
import { stay } from "@app/db/schema";
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { bookingDetail } from "../bookings/get.ts";

/**
 * 05#ep-stays.today for the session branch on `date`: arrivals = check_in_date = date (reserved/checked_in), departures =
 * check_out_date = date (checked_in/checked_out), in_house = checked_in with check_in_date ≤ date ≤ check_out_date; no type =
 * all three. Ordered by check-in date, room code.
 */
export async function staysToday(ctx: RequestContext, input: StaysTodayRequest): Promise<StaysTodayResponse> {
  requireRole(ctx, "stays.today");
  if (!ctx.branchId) throw new AppError("NOT_FOUND");
  const db = getDb();
  const d = input.date;
  const arrivals = and(eq(stay.checkInDate, d), inArray(stay.status, ["reserved", "checked_in"]));
  const departures = and(eq(stay.checkOutDate, d), inArray(stay.status, ["checked_in", "checked_out"]));
  const inHouse = and(eq(stay.status, "checked_in"), lte(stay.checkInDate, d), gte(stay.checkOutDate, d));
  const which =
    input.type === "arrivals"
      ? arrivals
      : input.type === "departures"
        ? departures
        : input.type === "in_house"
          ? inHouse
          : or(arrivals, departures, inHouse);
  const rows = (await tenantDb(ctx, db).select(stay, and(eq(stay.branchId, ctx.branchId), which))) as (typeof stay.$inferSelect)[];

  const cards = new Map<string, StayCard>();
  for (const bookingId of new Set(rows.map((s) => s.bookingId)))
    for (const card of (await bookingDetail(ctx, db, bookingId)).stays) cards.set(card.id, card);
  return rows
    .flatMap((s) => {
      const card = cards.get(s.id);
      return card ? [card] : [];
    })
    .sort(
      (a, b) =>
        a.checkInDate.localeCompare(b.checkInDate) || (a.roomCode ?? "").localeCompare(b.roomCode ?? "") || a.id.localeCompare(b.id),
    );
}
