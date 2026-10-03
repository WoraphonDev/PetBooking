// 07 §1 staff.booking_rescheduled: Web Push to front_desk+owner+groomer. `newDateTime` is caller-formatted (R-31).
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["staff.booking_rescheduled"]): { text: string } {
  return { text: `ลูกค้าเลื่อนนัด ${payload.petName ?? ""} เป็น ${payload.newDateTime ?? ""}` };
}
