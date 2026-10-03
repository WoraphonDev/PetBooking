// 07 §1 admin.data_request: email-only, with its own subject (Q-0060).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["admin.data_request"]): Rendered {
  return { subject: "[PDPA] คำขอใหม่", text: `[PDPA] คำขอ ${payload.type ?? ""} ใหม่` };
}
