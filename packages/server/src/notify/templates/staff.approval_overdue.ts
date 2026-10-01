// staff.approval_overdue — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "⏰ {bookingNo} รออนุมัติมา {waitedMinutes} นาที";

export function render(payload: NotificationPayloads["staff.approval_overdue"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
