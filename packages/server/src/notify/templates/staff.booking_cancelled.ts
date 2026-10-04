// 07 §1 staff.booking_cancelled: Web Push to front_desk+owner on liff.cancel. `isLate` is "(ยกเลิกกระชั้น)" or "" from the caller (Q-0088).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.booking_cancelled"]): Rendered {
  return { text: `ลูกค้ายกเลิก ${payload.bookingNo ?? ""} (${payload.customerName ?? ""}) ${payload.isLate ?? ""}`.trimEnd() };
}
