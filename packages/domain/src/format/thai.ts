// R-31 — Thai display formats (04#R-31): every screen uses only these (never toLocaleString) so server and client render identically.
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** standard Thai abbreviations, index = month - 1 */
const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** index = day of week, 0 = Sunday */
const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const BE_OFFSET = 543;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** non-negative integer → "1,234,567" */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function assertInteger(name: string, n: number): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${name} must be a safe integer: ${n}`);
}

export function formatTHB(input: { satang: number; decimals?: "auto" | "always" }): string {
  assertInteger("satang", input.satang);
  const abs = Math.abs(input.satang);
  const baht = Math.floor(abs / 100);
  const satang = abs % 100;
  // 1. auto hides .00; always (receipts/bills) shows it; negative → -฿500
  const showDecimals = input.decimals === "always" || satang !== 0;
  const body = `฿${groupThousands(baht)}${showDecimals ? `.${String(satang).padStart(2, "0")}` : ""}`;
  return input.satang < 0 ? `-${body}` : body;
}

export function formatThaiDate(input: { date: string; withWeekday?: boolean }): string {
  const m = DATE_RE.exec(input.date);
  if (!m) throw new RangeError(`invalid local date: ${input.date}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // calendar math only (UTC never leaks into the result): validates the day and gives the weekday
  const cal = new Date(Date.UTC(y, mo - 1, d));
  if (cal.getUTCFullYear() !== y || cal.getUTCMonth() !== mo - 1 || cal.getUTCDate() !== d) {
    throw new RangeError(`invalid local date: ${input.date}`);
  }
  // 2. "5 ต.ค. 2569" / "จ. 5 ต.ค. 2569" — Buddhist Era year always
  const text = `${d} ${MONTHS_TH[mo - 1]} ${y + BE_OFFSET}`;
  return input.withWeekday ? `${WEEKDAYS_TH[cal.getUTCDay()]} ${text}` : text;
}

export function formatTime(input: { instant: string; timezone: string }): string {
  const ms = Date.parse(input.instant);
  if (Number.isNaN(ms)) throw new RangeError(`invalid instant: ${input.instant}`);
  const local = new TZDate(ms, input.timezone);
  if (Number.isNaN(local.getHours())) throw new RangeError(`invalid timezone: ${input.timezone}`);
  // 3. "14:30 น." in the branch timezone
  return `${format(local, "HH:mm")} น.`;
}

export function formatWeight(input: { grams: number }): string {
  assertInteger("grams", input.grams);
  // 4. kg with 1 decimal, round half up (away from zero), hide ".0"
  const tenths = Math.floor((Math.abs(input.grams) + 50) / 100);
  const kg = `${Math.floor(tenths / 10)}${tenths % 10 === 0 ? "" : `.${tenths % 10}`}`;
  return `${input.grams < 0 && tenths !== 0 ? "-" : ""}${kg} กก.`;
}
