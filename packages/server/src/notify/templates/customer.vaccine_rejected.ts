// customer.vaccine_rejected — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "หลักฐานวัคซีน {vaccineName} ของ{petName}ยังไม่ผ่าน: {reason}\nส่งใหม่: {petUrl}";

export function render(payload: NotificationPayloads["customer.vaccine_rejected"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
