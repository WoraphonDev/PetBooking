// 07 §1 staff.booking_cancelled: Web Push to front_desk+owner on liff.cancel. `isLate` is caller-supplied text, empty when the cancel is not late (Q-0088).
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["staff.booking_cancelled"]): { text: string } {
  return { text: `ลูกค้ายกเลิก ${payload.bookingNo ?? ""} (${payload.customerName ?? ""}) ${payload.isLate ?? ""}`.trimEnd() };
}
