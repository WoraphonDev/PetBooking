// 06 C-23 date shortcuts: วันนี้ / 7 วัน / เดือนนี้ / เดือนก่อน, from the branch-local "today".
const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type Preset = "today" | "last7" | "thisMonth" | "lastMonth";
export const PRESETS: Preset[] = ["today", "last7", "thisMonth", "lastMonth"];

/** today = YYYY-MM-DD in the branch timezone */
export function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const t = Date.parse(`${today}T00:00:00Z`);
  const [y, m] = today.split("-").map(Number) as [number, number];
  if (preset === "today") return { from: today, to: today };
  if (preset === "last7") return { from: iso(t - 6 * DAY_MS), to: today };
  if (preset === "thisMonth") return { from: iso(Date.UTC(y, m - 1, 1)), to: today };
  return { from: iso(Date.UTC(y, m - 2, 1)), to: iso(Date.UTC(y, m - 1, 0)) };
}

export function localToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}
