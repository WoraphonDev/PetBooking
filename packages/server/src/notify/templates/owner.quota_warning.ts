// owner.quota_warning — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "ข้อความ LINE ใช้ไป {used}/{quota} แล้ว ระบบจะสงวนโควตาให้ข้อความสำคัญ";

export function render(payload: NotificationPayloads["owner.quota_warning"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
