// customer.ready_for_pickup — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "{petName}อาบน้ำตัดขนเสร็จแล้ว มารับได้เลยค่ะ ✨\n{reportCardLine}\nยอดชำระ {balance}";

export function render(payload: NotificationPayloads["customer.ready_for_pickup"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
