// 07 §1 owner.promptpay_changed: Web Push or email to every owner after branch.setPromptpay; subject per Q-0060.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["owner.promptpay_changed"]): Rendered {
  return {
    subject: "⚠️ บัญชีรับเงินของร้านถูกเปลี่ยน",
    text: `⚠️ บัญชีรับเงินถูกเปลี่ยนเป็น ${payload.idMasked ?? ""} โดย ${payload.byName ?? ""} — ถ้าไม่ใช่คุณ ติดต่อทีมงานทันที`,
  };
}
