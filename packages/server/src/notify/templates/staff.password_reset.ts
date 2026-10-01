// staff.password_reset — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ตั้งรหัสผ่านใหม่: {resetUrl} (หมดอายุใน 30 นาที) — ถ้าไม่ได้ขอ ให้เพิกเฉยอีเมลนี้";

export function render(payload: NotificationPayloads["staff.password_reset"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
