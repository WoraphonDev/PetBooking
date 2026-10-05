// 06#scr-C-13 — room map helpers.
import type { RoomMap } from "@app/contracts/dto/room-map";

export type Unit = RoomMap["units"][number];

/** ?date= → a valid local date or today */
export const parseDate = (v: string | null, today: string) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : today;

/** zones in first-seen order (the server returns units by zone / sort order) */
export function zonesOf(units: Unit[]): (string | null)[] {
  const out: (string | null)[] = [];
  for (const u of units) if (!out.includes(u.zone)) out.push(u.zone);
  return out;
}

/** grid groups: zone → units, optionally one zone only (undefined = all) */
export function groups(units: Unit[], zone: string | null | undefined): { zone: string | null; units: Unit[] }[] {
  return zonesOf(units)
    .filter((z) => zone === undefined || z === zone)
    .map((z) => ({ zone: z, units: units.filter((u) => u.zone === z) }));
}

/** a stay can be dropped on an active, empty room other than its own (the server re-checks every night — ROOM_TAKEN) */
export const canDrop = (target: Unit, stayRoomId: string | null) =>
  target.status === "active" && !target.occupant && target.id !== stayRoomId;

export const nextHousekeeping = (u: Unit) => (u.housekeeping === "dirty" ? "clean" : "dirty");
