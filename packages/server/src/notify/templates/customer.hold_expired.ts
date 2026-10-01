// customer.hold_expired — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "หมดเวลาชำระมัดจำ {bookingNo} คิวถูกปล่อยแล้ว\nจองใหม่: {bookAgainUrl}";

export function render(payload: NotificationPayloads["customer.hold_expired"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
