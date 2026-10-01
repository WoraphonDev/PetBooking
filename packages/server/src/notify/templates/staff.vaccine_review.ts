// staff.vaccine_review — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "มีหลักฐานวัคซีนของ {petName} รอตรวจ";

export function render(payload: NotificationPayloads["staff.vaccine_review"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
