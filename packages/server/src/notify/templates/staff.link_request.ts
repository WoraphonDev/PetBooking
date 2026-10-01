// staff.link_request — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "{lineName} ขอเชื่อม LINE กับลูกค้าเบอร์ {phone} — ตรวจสอบ";

export function render(payload: NotificationPayloads["staff.link_request"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
