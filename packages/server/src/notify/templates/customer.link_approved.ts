// customer.link_approved — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ร้าน{shopName}เชื่อมบัญชี LINE กับประวัติเดิมของคุณแล้ว ✅";

export function render(payload: NotificationPayloads["customer.link_approved"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
