// customer.booking_declined — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ขออภัย ร้านไม่สามารถรับการจอง {bookingNo} ได้\nเหตุผล: {reason}\n{refundLine}";

export function render(payload: NotificationPayloads["customer.booking_declined"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
