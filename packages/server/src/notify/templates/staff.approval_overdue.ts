// 07 §1 staff.approval_overdue: Web Push to front_desk+owner per overdue round.
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["staff.approval_overdue"]): { text: string } {
  return { text: `⏰ ${payload.bookingNo ?? ""} รออนุมัติมา ${payload.waitedMinutes ?? ""} นาที` };
}
