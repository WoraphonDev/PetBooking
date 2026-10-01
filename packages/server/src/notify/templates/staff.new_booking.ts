// staff.new_booking — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "จองใหม่ {bookingNo} — {customerName}: {summary}";

export function render(payload: NotificationPayloads["staff.new_booking"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
