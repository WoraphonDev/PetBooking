// R-17 — next grooming due date and reminder day (04#R-17). visitDates = local dates of done/picked_up groom appointments.

const DAY_MS = 86_400_000;
const REMIND_DAYS_BEFORE = 3;
const HISTORY_VISITS = 4;

const dayMs = (d: string) => {
  const ms = Date.parse(`${d}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(ms)) throw new RangeError(`invalid local date: ${d}`);
  return ms;
};
const addDays = (d: string, days: number) => new Date(dayMs(d) + days * DAY_MS).toISOString().slice(0, 10);

/** median of the gaps between the last 4 visits; needs ≥ 2 gaps; an even count averages the middle two, rounded up */
function historyInterval(sortedVisits: string[]): number | null {
  const recent = sortedVisits.slice(-HISTORY_VISITS);
  const gaps = recent
    .slice(1)
    .map((d, i) => Math.round((dayMs(d) - dayMs(recent[i] ?? d)) / DAY_MS))
    .sort((a, b) => a - b);
  if (gaps.length < 2) return null;
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1 ? (gaps[mid] ?? null) : Math.ceil(((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2);
}

export function nextGroomDue(input: {
  visitDates: string[];
  shopIntervalDays: number | null;
  defaultDays: number;
  hasFutureAppointment: boolean;
  petStatus: "active" | "deceased" | "rehomed";
}): { dueDate: string | null; remindOn: string | null; intervalDays: number | null; source: string } {
  // 1. no reminders for inactive pets or pets never groomed here
  if (input.petStatus !== "active") return { dueDate: null, remindOn: null, intervalDays: null, source: "pet_inactive" };
  if (input.visitDates.length === 0) return { dueDate: null, remindOn: null, intervalDays: null, source: "no_visit" };

  const visits = [...new Set(input.visitDates)].sort();
  // 2. shop setting → history median → branch default
  const history = historyInterval(visits);
  const [intervalDays, source] =
    input.shopIntervalDays !== null
      ? [input.shopIntervalDays, "shop"]
      : history !== null
        ? [history, "history"]
        : [input.defaultDays, "default"];

  // 3. due = last visit + interval, remind 3 days before (sent 10:00 local by the job)
  const dueDate = addDays(visits[visits.length - 1] ?? "", intervalDays);
  // 4. an upcoming appointment means no reminder
  if (input.hasFutureAppointment) return { dueDate, remindOn: null, intervalDays, source: `${source}:has_future_appointment` };
  return { dueDate, remindOn: addDays(dueDate, -REMIND_DAYS_BEFORE), intervalDays, source };
}
