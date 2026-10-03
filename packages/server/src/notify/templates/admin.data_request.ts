// 07 §1 admin.data_request: email-only; subject is the same text via the existing adapter (Q-0060).
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["admin.data_request"]): { text: string } {
  return { text: `[PDPA] คำขอ ${payload.type ?? ""} ใหม่` };
}
