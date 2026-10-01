// owner.support_access — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ทีมงานเข้าดูข้อมูลร้านเพื่อช่วยเหลือ: {reason}";

export function render(payload: NotificationPayloads["owner.support_access"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
