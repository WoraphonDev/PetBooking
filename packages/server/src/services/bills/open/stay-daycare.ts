import { type billLine, type booking, daycareSessionType, daycareVisit, roomType, stay, stayAddon } from "@app/db/schema";
import { and, asc, inArray, notInArray } from "drizzle-orm";
import type { RequestContext } from "../../../context.ts";
import type { Tx } from "../../../db.ts";
import { tenantDb } from "../../../repo/tenant.ts";

type Line = Omit<typeof billLine.$inferInsert, "organizationId" | "billId">;
const unique = <T>(xs: T[]) => [...new Set(xs)];

/**
 * Hotel and daycare lines of the bookings (05#ep-bills.open, T-0283): per stay a `stay_night` line (qty = nights at the
 * booked nightly price) followed by its `stay_addon` lines, then one `daycare` line per visit. Cancelled/no-show children
 * are skipped. Descriptions use the room type / session type name (Q-0071).
 */
export async function stayDaycareLines(ctx: RequestContext, tx: Tx, bookings: (typeof booking.$inferSelect)[]): Promise<Line[]> {
  if (bookings.length === 0) return [];
  const db = tenantDb(ctx, tx);
  const bookingIds = bookings.map((b) => b.id);
  const stays = (await db
    .select(stay, and(inArray(stay.bookingId, bookingIds), notInArray(stay.status, ["cancelled", "no_show"])))
    .orderBy(asc(stay.checkInDate), asc(stay.id))) as (typeof stay.$inferSelect)[];
  const visits = (await db
    .select(daycareVisit, and(inArray(daycareVisit.bookingId, bookingIds), notInArray(daycareVisit.status, ["cancelled", "no_show"])))
    .orderBy(asc(daycareVisit.visitDate), asc(daycareVisit.id))) as (typeof daycareVisit.$inferSelect)[];
  const addons = stays.length
    ? ((await db
        .select(
          stayAddon,
          inArray(
            stayAddon.stayId,
            stays.map((s) => s.id),
          ),
        )
        .orderBy(asc(stayAddon.id))) as (typeof stayAddon.$inferSelect)[])
    : [];
  const roomTypes = stays.length
    ? ((await db.select(roomType, inArray(roomType.id, unique(stays.map((s) => s.roomTypeId))))) as (typeof roomType.$inferSelect)[])
    : [];
  const sessions = visits.length
    ? ((await db.select(
        daycareSessionType,
        inArray(daycareSessionType.id, unique(visits.map((v) => v.sessionTypeId))),
      )) as (typeof daycareSessionType.$inferSelect)[])
    : [];

  const lines: Line[] = [];
  for (const s of stays) {
    lines.push({
      refType: "stay",
      refId: s.id,
      petId: s.petId,
      lineType: "stay_night",
      description: roomTypes.find((t) => t.id === s.roomTypeId)?.nameTh ?? "",
      quantity: s.nights,
      unitPriceSatang: s.nightlyPriceSatang,
      lineTotalSatang: s.nights * s.nightlyPriceSatang,
    });
    for (const a of addons.filter((x) => x.stayId === s.id))
      lines.push({
        refType: "stay_addon",
        refId: a.id,
        petId: s.petId,
        lineType: "stay_addon",
        description: a.nameSnapshot,
        quantity: a.quantity,
        unitPriceSatang: a.unitPriceSatang,
        lineTotalSatang: a.quantity * a.unitPriceSatang,
      });
  }
  for (const v of visits)
    lines.push({
      refType: "daycare_visit",
      refId: v.id,
      petId: v.petId,
      lineType: "daycare",
      description: sessions.find((t) => t.id === v.sessionTypeId)?.nameTh ?? "",
      quantity: 1,
      unitPriceSatang: v.priceSatang,
      lineTotalSatang: v.priceSatang,
    });
  return lines;
}
