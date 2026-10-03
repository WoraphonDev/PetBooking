// 07 §1 staff.approval_overdue: Web Push to front_desk+owner per overdue round.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.approval_overdue"]): Rendered {
  return { text: `⏰ ${payload.bookingNo ?? ""} รออนุมัติมา ${payload.waitedMinutes ?? ""} นาที` };
}
