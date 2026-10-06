// 07 §1 customer.reminder_24h (LINE push). dateTime / service arrive formatted by the reminder job (R-31, Q-0063).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.reminder_24h"]): Rendered {
  const text = `พรุ่งนี้ ${payload.dateTime ?? ""} มีนัด${payload.service ?? ""}ของ${payload.petName ?? ""} 🐶\nเลื่อน/ยกเลิก: ${payload.bookingUrl ?? ""}`;
  return { text, ...(payload.bookingUrl ? { url: String(payload.bookingUrl) } : {}) };
}
