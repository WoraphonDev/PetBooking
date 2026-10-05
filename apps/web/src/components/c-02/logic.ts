// 06#scr-C-02 — pure helpers for the grooming calendar grid.
import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { CalendarDay } from "@app/contracts/dto/calendar-day";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";

export const VIEWS = ["day", "week"] as const;
export type View = (typeof VIEWS)[number];
/** px per minute of the day grid */
export const PX_PER_MINUTE = 1.6;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** YYYY-MM-DD + n days */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ?date=&view= → valid values (today / day as fallbacks) */
export function parseQuery(params: URLSearchParams, today: string): { date: string; view: View } {
  const date = params.get("date");
  const view = params.get("view");
  return {
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : today,
    view: view === "week" ? "week" : "day",
  };
}

/** แกน Y = เวลาเปิด–ปิดของวัน ทีละ slot_step; a closed day has no rows */
export function timeRows(day: Pick<CalendarDay, "opensAt" | "closesAt">, slotStepMinutes: number): string[] {
  if (!day.opensAt || !day.closesAt) return [];
  const rows: string[] = [];
  for (let m = toMin(day.opensAt); m < toMin(day.closesAt); m += slotStepMinutes) rows.push(toTime(m));
  return rows;
}

/** minutes from the day's opening to an instant (branch-local), may be negative / past closing */
export function minutesFromOpen(instant: string, day: Pick<CalendarDay, "date" | "opensAt">, timezone: string): number {
  const open = Date.parse(localToUtc({ date: day.date, time: day.opensAt ?? "00:00", timezone }));
  return Math.round((Date.parse(instant) - open) / 60_000);
}

/** vertical box (px) of an interval clipped to the open hours */
export function box(
  startsAt: string,
  endsAt: string,
  day: Pick<CalendarDay, "date" | "opensAt" | "closesAt">,
  timezone: string,
): { top: number; height: number } | null {
  if (!day.opensAt || !day.closesAt) return null;
  const span = toMin(day.closesAt) - toMin(day.opensAt);
  const from = Math.max(0, minutesFromOpen(startsAt, day, timezone));
  const to = Math.min(span, minutesFromOpen(endsAt, day, timezone));
  if (to <= from) return null;
  return { top: from * PX_PER_MINUTE, height: (to - from) * PX_PER_MINUTE };
}

/** drop target → the new start instant */
export function slotInstant(date: string, time: string, timezone: string): string {
  return localToUtc({ date, time, timezone });
}

/** only scheduled appointments move, and only for owner / front desk */
export const canDrag = (a: Pick<AppointmentCard, "status">, canEdit: boolean) => canEdit && a.status === "scheduled";

/** มัดจำ: ✓ when settled / not needed, otherwise รอ */
export const depositSettled = (status: AppointmentCard["depositStatus"]) =>
  status === "not_required" || status === "verified" || status === "applied";

/** ระดับลูกค้า dot: 1 red, 2 orange, 4 gold, 3 none */
export const RELIABILITY_DOT: Record<number, string | undefined> = { 1: "bg-red-500", 2: "bg-orange-400", 4: "bg-yellow-400" };

/** icon per temperament flag (🦷 กัด ฯลฯ) */
export const FLAG_ICON: Record<string, string> = {
  bites: "🦷",
  needs_muzzle: "😷",
  dryer_fear: "💨",
  noise_sensitive: "🔊",
  same_groomer_only: "👤",
  dog_reactive: "🐕",
  cat_reactive: "🐈",
  anxious: "😟",
  other: "⚠️",
};

/** card colour by groom_status */
export const STATUS_TONE: Record<AppointmentCard["status"], string> = {
  scheduled: "border-sky-300 bg-sky-50",
  checked_in: "border-violet-300 bg-violet-50",
  in_progress: "border-amber-300 bg-amber-50",
  done: "border-emerald-300 bg-emerald-50",
  picked_up: "border-slate-300 bg-slate-50",
  no_show: "border-red-300 bg-red-50",
  cancelled: "border-slate-200 bg-slate-50 opacity-60",
};

/** local date of an instant (week view grouping) */
export const localDate = (instant: string, timezone: string) => toLocalDate({ instant, timezone });
