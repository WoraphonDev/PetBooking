// R-20 — local dates/times (04#R-20): DB stores UTC; every "which day" decision uses branch.timezone, never the server's or browser's.
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** "YYYY-MM-DD" → [year, monthIndex, day]; never goes through `new Date("YYYY-MM-DD")` (that would be UTC) */
function parseDate(date: string): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`invalid local date: ${date}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // reject overflow like 2026-02-30 (the Date constructor would silently roll it over)
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new RangeError(`invalid local date: ${date}`);
  }
  return [y, mo - 1, d];
}

function parseTime(time: string): [number, number] {
  const m = TIME_RE.exec(time);
  const [h, mi] = m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) throw new RangeError(`invalid local time: ${time}`);
  return [h, mi];
}

/** wall-clock moment in `timezone` → ISO UTC string */
function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, timezone: string): string {
  const ms = new TZDate(y, mo, d, h, mi, timezone).getTime();
  if (Number.isNaN(ms)) throw new RangeError(`invalid timezone: ${timezone}`);
  return new Date(ms).toISOString();
}

export function toLocalDate(input: { instant: string; timezone: string }): string {
  const ms = Date.parse(input.instant);
  if (Number.isNaN(ms)) throw new RangeError(`invalid instant: ${input.instant}`);
  const local = new TZDate(ms, input.timezone);
  if (Number.isNaN(local.getTime()) || Number.isNaN(local.getFullYear())) throw new RangeError(`invalid timezone: ${input.timezone}`);
  return format(local, "yyyy-MM-dd");
}

export function localToUtc(input: { date: string; time: string; timezone: string }): string {
  const [y, mo, d] = parseDate(input.date);
  const [h, mi] = parseTime(input.time);
  return wallToUtc(y, mo, d, h, mi, input.timezone);
}

/** [start, end) of the local day in UTC — end is the next local midnight (used for daily reports/summaries) */
export function localDayBounds(input: { date: string; timezone: string }): { start: string; end: string } {
  const [y, mo, d] = parseDate(input.date);
  return { start: wallToUtc(y, mo, d, 0, 0, input.timezone), end: wallToUtc(y, mo, d + 1, 0, 0, input.timezone) };
}
