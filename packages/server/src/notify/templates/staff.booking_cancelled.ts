// staff.booking_cancelled — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ลูกค้ายกเลิก {bookingNo} ({customerName}) {isLate}";

export function render(payload: NotificationPayloads["staff.booking_cancelled"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
