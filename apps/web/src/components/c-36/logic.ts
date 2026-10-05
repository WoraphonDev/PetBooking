// 06#scr-C-36 — staff list / invite / edit helpers.
import type { StaffUserItem, StaffUserPublicItem } from "@app/contracts/dto/staff-user-item";
import { StaffUsersInviteRequest } from "@app/contracts/endpoints/staffUsers.invite";
import type { StaffUsersUpdateRequest } from "@app/contracts/endpoints/staffUsers.update";
import type { TimeOffCreateRequest } from "@app/contracts/endpoints/timeOff.create";
import type { WorkingHoursSetRequest } from "@app/contracts/endpoints/workingHours.set";
import type { StaffRole } from "@app/contracts/enums";
import { localToUtc } from "@app/domain/time/local-time";

/** rows จ.–อา. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** C-36 is OF — staffUsers.list then returns full items */
export const fullItems = (list: (StaffUserItem | StaffUserPublicItem)[]): StaffUserItem[] =>
  list.filter((x): x is StaffUserItem => "role" in x);

/** "time ago" bucket for last_login_at */
export function timeAgo(instant: string, now: number): { key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo"; n: number } {
  const minutes = Math.max(0, Math.floor((now - Date.parse(instant)) / 60_000));
  if (minutes < 1) return { key: "justNow", n: 0 };
  if (minutes < 60) return { key: "minutesAgo", n: minutes };
  if (minutes < 24 * 60) return { key: "hoursAgo", n: Math.floor(minutes / 60) };
  return { key: "daysAgo", n: Math.floor(minutes / (24 * 60)) };
}

export type InviteForm = { displayName: string; email: string; role: StaffRole; isGroomer: boolean };
export const emptyInvite = (): InviteForm => ({ displayName: "", email: "", role: "staff", isGroomer: true });
export type InviteErrors = Partial<Record<"displayName" | "email", true>>;
/** ชื่อเล่น บังคับ (≤ 40) · อีเมลไม่บังคับ */
export function inviteBody(f: InviteForm): { body: StaffUsersInviteRequest | null; errors: InviteErrors } {
  const errors: InviteErrors = {};
  const name = f.displayName.trim();
  const email = f.email.trim();
  if (name.length < 1 || name.length > 40) errors.displayName = true;
  // same zod rule as the API
  if (email && !StaffUsersInviteRequest.shape.email.safeParse(email).success) errors.email = true;
  if (Object.keys(errors).length) return { body: null, errors };
  return { body: { displayName: name, ...(email ? { email: email.toLowerCase() } : {}), role: f.role, isGroomer: f.isGroomer }, errors };
}

export type EditForm = { displayName: string; role: StaffRole; isGroomer: boolean };
/** staffUsers.update: only what changed; null when nothing did */
export function editBody(before: StaffUserItem, f: EditForm): StaffUsersUpdateRequest | null {
  const name = f.displayName.trim();
  const body: StaffUsersUpdateRequest = {
    ...(name && name !== before.displayName ? { displayName: name } : {}),
    ...(f.role !== before.role ? { role: f.role } : {}),
    ...(f.isGroomer !== before.isGroomer ? { isGroomer: f.isGroomer } : {}),
  };
  return Object.keys(body).length ? body : null;
}

/** ปิดใช้งาน / เปิดใช้งาน — invited people have no toggle (Q-0116: invited stays invited) */
export const toggleStatus = (s: StaffUserItem): StaffUsersUpdateRequest | null =>
  s.status === "active" ? { status: "disabled" } : s.status === "disabled" ? { status: "active" } : null;

/** LINE share link for the invite (opens the LINE app's share sheet) */
export const lineShareUrl = (inviteUrl: string) => `https://line.me/R/share?text=${encodeURIComponent(inviteUrl)}`;

/** time selects ทีละ 30 นาที */
export const STEP_MINUTES = 30;

export type DayRow = {
  weekday: number;
  /** วันทำงาน */
  on: boolean;
  startsAt: string | null;
  endsAt: string | null;
  breakStartsAt: string | null;
  breakEndsAt: string | null;
};

/** the 7 rows จ.–อา. from StaffUserItem.workingHours; a weekday without a row is a day off */
export function dayRows(hours: StaffUserItem["workingHours"]): DayRow[] {
  return WEEK_ORDER.map((weekday) => {
    const h = hours.find((x) => x.weekday === weekday);
    return h
      ? { weekday, on: true, startsAt: h.startsAt, endsAt: h.endsAt, breakStartsAt: h.breakStartsAt, breakEndsAt: h.breakEndsAt }
      : { weekday, on: false, startsAt: "09:00", endsAt: "18:00", breakStartsAt: null, breakEndsAt: null };
  });
}

/** 06 กติกา: เลิก > เริ่ม · พักอยู่ในช่วงทำงาน (both ends or none, Q-1011); returns the weekdays that fail */
export function invalidDays(rows: DayRow[]): number[] {
  return rows
    .filter((r) => {
      if (!r.on) return false;
      if (!r.startsAt || !r.endsAt || r.endsAt <= r.startsAt) return true;
      if (!r.breakStartsAt && !r.breakEndsAt) return false;
      if (!r.breakStartsAt || !r.breakEndsAt) return true;
      return r.breakStartsAt < r.startsAt || r.breakEndsAt <= r.breakStartsAt || r.breakEndsAt > r.endsAt;
    })
    .map((r) => r.weekday);
}

/** workingHours.set body (the whole week; days off are left out); null while a row is invalid */
export function workingHoursBody(rows: DayRow[]): WorkingHoursSetRequest | null {
  if (invalidDays(rows).length) return null;
  return {
    days: rows
      .filter((r) => r.on)
      .map((r) => ({
        weekday: r.weekday,
        startsAt: r.startsAt ?? "",
        endsAt: r.endsAt ?? "",
        ...(r.breakStartsAt && r.breakEndsAt ? { breakStartsAt: r.breakStartsAt, breakEndsAt: r.breakEndsAt } : {}),
      })),
  };
}

/** timeOff.list range: today → +365 days (06 gives none — Q-1021) */
export function timeOffRange(today: string): { from: string; to: string } {
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + 365 * 86_400_000).toISOString().slice(0, 10);
  return { from: today, to };
}

export type TimeOffForm = {
  staffUserId: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  reason: string;
};
export const emptyTimeOff = (): TimeOffForm => ({
  staffUserId: null,
  startDate: null,
  startTime: "00:00",
  endDate: null,
  endTime: "23:30",
  reason: "",
});
export type TimeOffErrors = Partial<Record<"staffUserId" | "start" | "end", true>>;

/** timeOff.create body from branch-local date + time; ends_at > starts_at */
export function timeOffBody(f: TimeOffForm, timezone: string): { body: TimeOffCreateRequest | null; errors: TimeOffErrors } {
  const errors: TimeOffErrors = {};
  if (!f.staffUserId) errors.staffUserId = true;
  if (!f.startDate || !f.startTime) errors.start = true;
  if (!f.endDate || !f.endTime) errors.end = true;
  if (Object.keys(errors).length) return { body: null, errors };
  const startsAt = localToUtc({ date: f.startDate as string, time: f.startTime as string, timezone });
  const endsAt = localToUtc({ date: f.endDate as string, time: f.endTime as string, timezone });
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return { body: null, errors: { end: true } };
  const reason = f.reason.trim();
  return { body: { staffUserId: f.staffUserId as string, startsAt, endsAt, ...(reason ? { reason } : {}) }, errors };
}
