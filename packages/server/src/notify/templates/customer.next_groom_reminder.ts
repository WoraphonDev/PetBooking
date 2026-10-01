// customer.next_groom_reminder — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ครบรอบอาบน้ำตัดขนของ{petName}แล้ว ({dueDate}) 🛁\nจองคิว: {bookUrl}";

export function render(payload: NotificationPayloads["customer.next_groom_reminder"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
