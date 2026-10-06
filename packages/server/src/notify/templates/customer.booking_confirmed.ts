// 07 §1 customer.booking_confirmed (LINE reply/push). summary / dateTime arrive formatted by the caller (R-31, Q-0091).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.booking_confirmed"]): Rendered {
  const text = [`ยืนยันการจอง ${payload.bookingNo ?? ""} ✅`, String(payload.summary ?? ""), `📅 ${payload.dateTime ?? ""}`].join("\n");
  return { text, ...(payload.bookingUrl ? { url: String(payload.bookingUrl) } : {}) };
}
