// customer.booking_confirmed — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ยืนยันการจอง {bookingNo} ✅\n{summary}\n📅 {dateTime}";

export function render(payload: NotificationPayloads["customer.booking_confirmed"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
