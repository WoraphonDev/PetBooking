// 07 §1 customer.booking_declined (LINE push). refundLine comes ready from bookings.decline ("" when nothing is returned,
// Q-0040 answer) — an empty line is left out.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.booking_declined"]): Rendered {
  const lines = [
    `ขออภัย ร้านไม่สามารถรับการจอง ${payload.bookingNo ?? ""} ได้`,
    `เหตุผล: ${payload.reason ?? ""}`,
    String(payload.refundLine ?? ""),
  ];
  return { text: lines.filter((l, i) => i < 2 || l !== "").join("\n") };
}
