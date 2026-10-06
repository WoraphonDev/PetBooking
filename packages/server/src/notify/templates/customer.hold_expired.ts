// 07 §1 customer.hold_expired (LINE push). bookAgainUrl is the shop's LIFF home.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.hold_expired"]): Rendered {
  const text = `หมดเวลาชำระมัดจำ ${payload.bookingNo ?? ""} คิวถูกปล่อยแล้ว\nจองใหม่: ${payload.bookAgainUrl ?? ""}`;
  return { text, ...(payload.bookAgainUrl ? { url: String(payload.bookAgainUrl) } : {}) };
}
