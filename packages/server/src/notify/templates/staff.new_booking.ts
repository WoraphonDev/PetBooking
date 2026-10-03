// 07 §1 staff.new_booking: Web Push to front_desk+owner. `summary` arrives formatted by the caller (R-31).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.new_booking"]): Rendered {
  return { text: `จองใหม่ ${payload.bookingNo ?? ""} — ${payload.customerName ?? ""}: ${payload.summary ?? ""}` };
}
