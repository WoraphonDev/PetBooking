// staff.password_reset — 07 §1 text; email subject per Q-0060 (stub text: the template task for this key replaces the body).
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";
import type { Rendered } from "./index.ts";

const TEXT = "ตั้งรหัสผ่านใหม่: {resetUrl} (หมดอายุใน 30 นาที) — ถ้าไม่ได้ขอ ให้เพิกเฉยอีเมลนี้";

export function render(payload: NotificationPayloads["staff.password_reset"]): Rendered {
  return { subject: "ตั้งรหัสผ่านใหม่", text: fill(TEXT, payload) };
}
