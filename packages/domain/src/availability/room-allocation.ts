// R-10 — pick a room unit for a stay (04#R-10). Dates are local YYYY-MM-DD; a stay occupies [checkIn, checkOut).

type RoomUnit = { id: string; code: string; roomTypeId: string; status: "active" | "maintenance" | "archived"; sortOrder: number };
/** stays with status reserved | checked_in */
type ActiveStay = { roomUnitId: string; checkInDate: string; checkOutDate: string };

export function allocateRoom(input: {
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  units: RoomUnit[];
  stays: ActiveStay[];
}): {
  roomUnitId: string | null;
  rule: "back_to_back_before" | "back_to_back_after" | "first_free" | "none_free";
} {
  const { checkInDate: checkIn, checkOutDate: checkOut } = input;
  const staysOf = (unitId: string) => input.stays.filter((s) => s.roomUnitId === unitId);
  // half-open ranges: the previous guest's checkout day can be our check-in day
  const overlaps = (s: ActiveStay) => s.checkInDate < checkOut && checkIn < s.checkOutDate;

  // 1. active units of this type with no overlapping stay, in sortOrder then code order
  const free = input.units
    .filter((u) => u.roomTypeId === input.roomTypeId && u.status === "active" && !staysOf(u.id).some(overlaps))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  // 2. fewest gaps: a guest leaving on our check-in day, then a guest arriving on our checkout day, else the first free unit
  const before = free.find((u) => staysOf(u.id).some((s) => s.checkOutDate === checkIn));
  if (before) return { roomUnitId: before.id, rule: "back_to_back_before" };
  const after = free.find((u) => staysOf(u.id).some((s) => s.checkInDate === checkOut));
  if (after) return { roomUnitId: after.id, rule: "back_to_back_after" };
  const first = free[0];
  if (first) return { roomUnitId: first.id, rule: "first_free" };
  // 3. nothing free → API ROOM_TAKEN
  return { roomUnitId: null, rule: "none_free" };
}
