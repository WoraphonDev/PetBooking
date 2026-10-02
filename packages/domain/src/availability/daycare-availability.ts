// R-29 — free daycare places for one day (04#R-29). Only active session types appear in the result.

type Session = "full_day" | "morning" | "afternoon";
const COUNTED = new Set(["reserved", "checked_in", "checked_out"]);

export function daycareAvailability(input: {
  sessionTypes: { session: Session; capacity: number; status: string }[];
  visits: { session: Session; status: string }[];
  closed?: boolean;
}): Partial<Record<Session, number>> {
  const cap = new Map<Session, number>();
  for (const t of input.sessionTypes) if (t.status === "active") cap.set(t.session, t.capacity);

  // 1. visits that hold a place that day
  const count = (s: Session) => input.visits.filter((v) => v.session === s && COUNTED.has(v.status)).length;
  const fullDay = count("full_day");

  const result: Partial<Record<Session, number>> = {};
  for (const s of ["morning", "afternoon"] as const) {
    const c = cap.get(s);
    // 2. a half-day area also holds every full-day visit
    if (c !== undefined) result[s] = c - (count(s) + fullDay);
  }
  const fullCap = cap.get("full_day");
  if (fullCap !== undefined) {
    // 3. its own cap, and every half that is offered
    const halves = (["morning", "afternoon"] as const).flatMap((s) => (result[s] === undefined ? [] : [result[s]]));
    result.full_day = Math.min(fullCap - fullDay, ...halves);
  }
  // 4. never negative; a closed daycare module offers nothing
  for (const s of Object.keys(result) as Session[]) result[s] = input.closed ? 0 : Math.max(0, result[s] ?? 0);
  return result;
}
