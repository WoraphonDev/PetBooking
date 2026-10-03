// owner.promptpay_changed — 07 §1 text; email subject per Q-0060 (stub text: the template task for this key replaces the body).
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";
import type { Rendered } from "./index.ts";

const TEXT = "⚠️ บัญชีรับเงินถูกเปลี่ยนเป็น {idMasked} โดย {byName} — ถ้าไม่ใช่คุณ ติดต่อทีมงานทันที";

export function render(payload: NotificationPayloads["owner.promptpay_changed"]): Rendered {
  return { subject: "⚠️ บัญชีรับเงินของร้านถูกเปลี่ยน", text: fill(TEXT, payload) };
}
