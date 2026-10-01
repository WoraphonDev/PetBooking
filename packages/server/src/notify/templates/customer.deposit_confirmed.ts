// customer.deposit_confirmed — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ได้รับมัดจำ {amount} สำหรับ {bookingNo} แล้ว ขอบคุณค่ะ";

export function render(payload: NotificationPayloads["customer.deposit_confirmed"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
