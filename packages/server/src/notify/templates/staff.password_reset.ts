// 07 §1 staff.password_reset: email-only, with its own subject (Q-0060).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.password_reset"]): Rendered {
  return {
    subject: "ตั้งรหัสผ่านใหม่",
    text: `ตั้งรหัสผ่านใหม่: ${payload.resetUrl ?? ""} (หมดอายุใน 30 นาที) — ถ้าไม่ได้ขอ ให้เพิกเฉยอีเมลนี้`,
  };
}
