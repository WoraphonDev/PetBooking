// staff.slip_submitted — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "สลิปใหม่ {bookingNo} {amount} {duplicateFlag}";

export function render(payload: NotificationPayloads["staff.slip_submitted"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
