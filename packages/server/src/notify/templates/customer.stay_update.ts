// customer.stay_update — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "อัปเดตวันนี้ของ{petName} 📸 {updatesUrl}";

export function render(payload: NotificationPayloads["customer.stay_update"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
