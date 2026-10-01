// customer.booking_received — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ได้รับการจอง {bookingNo} แล้ว 🐾\n{summary}\n{depositLine}\nดูรายละเอียด: {bookingUrl}";

export function render(payload: NotificationPayloads["customer.booking_received"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
