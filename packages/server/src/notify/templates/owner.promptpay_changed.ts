// owner.promptpay_changed — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "⚠️ บัญชีรับเงินถูกเปลี่ยนเป็น {idMasked} โดย {byName} — ถ้าไม่ใช่คุณ ติดต่อทีมงานทันที";

export function render(payload: NotificationPayloads["owner.promptpay_changed"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
