// customer.reminder_24h — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "พรุ่งนี้ {dateTime} มีนัด{service}ของ{petName} 🐶\nเลื่อน/ยกเลิก: {bookingUrl}";

export function render(payload: NotificationPayloads["customer.reminder_24h"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
