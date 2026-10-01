// customer.balance_link — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ยอดคงเหลือ {amount} ชำระผ่าน PromptPay: {payUrl}";

export function render(payload: NotificationPayloads["customer.balance_link"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
