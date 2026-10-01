// customer.booking_cancelled — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "การจอง {bookingNo} ถูกยกเลิก\n{reason}\n{moneyLine}";

export function render(payload: NotificationPayloads["customer.booking_cancelled"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
