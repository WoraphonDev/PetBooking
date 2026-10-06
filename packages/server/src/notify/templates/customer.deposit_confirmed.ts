// 07 §1 customer.deposit_confirmed (LINE push). `amount` arrives formatted by the caller (R-31, slips.verify / recordDeposit).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.deposit_confirmed"]): Rendered {
  return { text: `ได้รับมัดจำ ${payload.amount ?? ""} สำหรับ ${payload.bookingNo ?? ""} แล้ว ขอบคุณค่ะ` };
}
