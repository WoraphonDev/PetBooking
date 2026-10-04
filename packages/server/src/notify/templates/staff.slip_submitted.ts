// 07 §1 staff.slip_submitted: Web Push to front_desk+owner. `amount` is caller-formatted (R-31); `duplicateFlag` is "⚠️ สลิปนี้เคยใช้แล้ว" or "" from the caller (Q-0088).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.slip_submitted"]): Rendered {
  return { text: `สลิปใหม่ ${payload.bookingNo ?? ""} ${payload.amount ?? ""} ${payload.duplicateFlag ?? ""}`.trimEnd() };
}
