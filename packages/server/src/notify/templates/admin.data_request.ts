// admin.data_request — stub (07 §1 'ข้อความ', variables substituted as-is). The template task for this key replaces only this file.
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";

const TEXT = "[PDPA] คำขอ {type} ใหม่";

export function render(payload: NotificationPayloads["admin.data_request"]): { text: string } {
  return { text: fill(TEXT, payload) };
}
