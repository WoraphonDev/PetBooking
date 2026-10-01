// customer.receipt — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ใบเสร็จ {receiptNo} ยอด {total}\n{receiptUrl}";

export function render(payload: NotificationPayloads["customer.receipt"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
