// 07 §1 customer.booking_rescheduled (LINE push). The two date-times arrive formatted by the caller (R-31).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.booking_rescheduled"]): Rendered {
  return { text: `นัดของ${payload.petName ?? ""}ถูกเลื่อน\nจาก ${payload.oldDateTime ?? ""}\nเป็น ${payload.newDateTime ?? ""}` };
}
