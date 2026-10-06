// 07 §1 customer.slip_rejected (LINE push). newDeadline arrives formatted by slips.reject (R-31); payUrl is the L-07 link.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.slip_rejected"]): Rendered {
  const text = `สลิปของ ${payload.bookingNo ?? ""} ยังไม่ผ่านการตรวจ: ${payload.reason ?? ""}\nกรุณาส่งใหม่ภายใน ${payload.newDeadline ?? ""}\n${payload.payUrl ?? ""}`;
  return { text, ...(payload.payUrl ? { url: String(payload.payUrl) } : {}) };
}
