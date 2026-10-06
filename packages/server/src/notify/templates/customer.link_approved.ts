// 07 §1 customer.link_approved (LINE push): sent when the shop approves a LINE ↔ existing-customer link (linkRequests.approve).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.link_approved"]): Rendered {
  return { text: `ร้าน${payload.shopName ?? ""}เชื่อมบัญชี LINE กับประวัติเดิมของคุณแล้ว ✅` };
}
