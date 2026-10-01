// customer.booking_rescheduled — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "นัดของ{petName}ถูกเลื่อน\nจาก {oldDateTime}\nเป็น {newDateTime}";

export function render(payload: NotificationPayloads["customer.booking_rescheduled"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
