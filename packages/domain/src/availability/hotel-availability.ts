// R-28 — free units of a room type for a whole stay (04#R-28). Dates are local YYYY-MM-DD; a stay occupies [checkIn, checkOut).

type RoomUnit = { id: string; code: string; roomTypeId: string; status: "active" | "maintenance" | "archived"; sortOrder: number };
/** stays with status reserved | checked_in */
type ActiveStay = { roomUnitId: string; checkInDate: string; checkOutDate: string };

/** calendar day after `date` (pure date math, no time zone involved) */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

export function hotelAvailability(input: {
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  units: RoomUnit[];
  stays: ActiveStay[];
  closedDates?: string[];
}): { availableUnits: number; byNight: { date: string; freeUnits: number }[]; reason: "ok" | "full" | "closed" } {
  const units = input.units.filter((u) => u.roomTypeId === input.roomTypeId && u.status === "active");
  const freeFor = (unitId: string, from: string, to: string) =>
    !input.stays.some((s) => s.roomUnitId === unitId && s.checkInDate < to && from < s.checkOutDate);

  const nights: string[] = [];
  for (let d = input.checkInDate; d < input.checkOutDate; d = nextDay(d)) nights.push(d);

  // 1. units free for the whole range (no room moves during a stay)
  const wholeRange = units.filter((u) => freeFor(u.id, input.checkInDate, input.checkOutDate)).length;
  // 2. per night [d, d+1) for the calendar
  const byNight = nights.map((date) => ({ date, freeUnits: units.filter((u) => freeFor(u.id, date, nextDay(date))).length }));
  // 3. a hotel closure on any night of the stay closes the whole request
  if (nights.some((d) => input.closedDates?.includes(d))) return { availableUnits: 0, byNight, reason: "closed" };
  return { availableUnits: wholeRange, byNight, reason: wholeRange > 0 ? "ok" : "full" };
}
