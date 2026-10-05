// 06#scr-C-31 — pure helpers for the opening-hours and closures form.
import type { BranchSettings } from "@app/contracts/dto/branch-settings";
import type { BranchSetHoursRequest } from "@app/contracts/endpoints/branch.setHours";
import type { ClosuresCreateRequest } from "@app/contracts/endpoints/closures.create";
import type { ClosureScope } from "@app/contracts/enums";
import { localToUtc } from "@app/domain/time/local-time";

/** rows จ.–อา. (branch_hours.weekday: 0 = Sunday) */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
/** time select ทีละ 30 นาที */
export const STEP_MINUTES = 30;

export type HoursRow = { weekday: number; isClosed: boolean; opensAt: string | null; closesAt: string | null };

/** the 7 rows from branch.get; a weekday without a row shows as closed */
export function hoursRows(hours: BranchSettings["hours"]): HoursRow[] {
  return WEEK_ORDER.map((weekday) => {
    const h = hours.find((x) => x.weekday === weekday);
    return h
      ? { weekday, isClosed: h.isClosed, opensAt: h.opensAt, closesAt: h.closesAt }
      : { weekday, isClosed: true, opensAt: null, closesAt: null };
  });
}

/** "ปิด > เปิด" on every open day; returns the weekdays that fail */
export function invalidHours(rows: HoursRow[]): number[] {
  return rows.filter((r) => !r.isClosed && (!r.opensAt || !r.closesAt || r.closesAt <= r.opensAt)).map((r) => r.weekday);
}

/** branch.setHours body; null while a row is invalid */
export function setHoursBody(rows: HoursRow[]): BranchSetHoursRequest | null {
  if (invalidHours(rows).length) return null;
  return {
    hours: rows.map((r) =>
      r.isClosed
        ? { weekday: r.weekday, isClosed: true }
        : { weekday: r.weekday, isClosed: false, opensAt: r.opensAt ?? "", closesAt: r.closesAt ?? "" },
    ),
  };
}

export type ClosureForm = {
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  scope: ClosureScope | null;
  reason: string;
};
export const emptyClosure = (): ClosureForm => ({
  startDate: null,
  startTime: "00:00",
  endDate: null,
  endTime: "23:30",
  scope: "all",
  reason: "",
});

export type ClosureErrors = Partial<Record<"start" | "end" | "scope" | "reason", true>>;
/** closures.create body from branch-local date + time; `errors` lists the fields to flag */
export function closureBody(form: ClosureForm, timezone: string): { body: ClosuresCreateRequest | null; errors: ClosureErrors } {
  const errors: ClosureErrors = {};
  if (!form.startDate || !form.startTime) errors.start = true;
  if (!form.endDate || !form.endTime) errors.end = true;
  if (!form.scope) errors.scope = true;
  if (form.reason.length > 200) errors.reason = true;
  if (errors.start || errors.end || errors.scope || errors.reason) return { body: null, errors };
  const startsAt = localToUtc({ date: form.startDate as string, time: form.startTime as string, timezone });
  const endsAt = localToUtc({ date: form.endDate as string, time: form.endTime as string, timezone });
  // สิ้นสุด > เริ่ม
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return { body: null, errors: { end: true } };
  const reason = form.reason.trim();
  return { body: { startsAt, endsAt, scope: form.scope as ClosureScope, ...(reason ? { reason } : {}) }, errors };
}

/** dates picked in the holiday dialog for one year (dedupe, sorted, same year only) */
export function holidayDates(year: number, dates: string[]): string[] {
  return [...new Set(dates)].filter((d) => d.startsWith(`${year}-`)).sort();
}
