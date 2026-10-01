// customer.slip_rejected — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "สลิปของ {bookingNo} ยังไม่ผ่านการตรวจ: {reason}\nกรุณาส่งใหม่ภายใน {newDeadline}\n{payUrl}";

export function render(payload: NotificationPayloads["customer.slip_rejected"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
