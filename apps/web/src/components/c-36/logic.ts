// 06#scr-C-36 — staff list / invite / edit helpers.
import type { StaffUserItem, StaffUserPublicItem } from "@app/contracts/dto/staff-user-item";
import { StaffUsersInviteRequest } from "@app/contracts/endpoints/staffUsers.invite";
import type { StaffUsersUpdateRequest } from "@app/contracts/endpoints/staffUsers.update";
import type { StaffRole } from "@app/contracts/enums";

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
