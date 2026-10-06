// 07 §1 customer.balance_link (LINE push). amount arrives formatted by bookings.balanceLink (R-31); payUrl is the L-14 link.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.balance_link"]): Rendered {
  const text = `ยอดคงเหลือ ${payload.amount ?? ""} ชำระผ่าน PromptPay: ${payload.payUrl ?? ""}`;
  return { text, ...(payload.payUrl ? { url: String(payload.payUrl) } : {}) };
}
