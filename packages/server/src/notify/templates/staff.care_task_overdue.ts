// staff.care_task_overdue — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "⚠️ เลยเวลา: {title} — {petName} ห้อง {roomCode}";

export function render(payload: NotificationPayloads["staff.care_task_overdue"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
