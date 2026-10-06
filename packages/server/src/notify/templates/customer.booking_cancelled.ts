// 07 §1 customer.booking_cancelled (LINE push). reason / moneyLine come ready from bookings.cancel; empty lines are left out.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.booking_cancelled"]): Rendered {
  const lines = [`การจอง ${payload.bookingNo ?? ""} ถูกยกเลิก`, String(payload.reason ?? ""), String(payload.moneyLine ?? "")];
  return { text: lines.filter((l, i) => i === 0 || l !== "").join("\n") };
}
