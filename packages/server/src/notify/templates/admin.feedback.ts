// 07 §1 admin.feedback: email to every platform admin; subject per Q-0060.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["admin.feedback"]): Rendered {
  return {
    subject: `[Feedback] ${payload.shopName ?? ""}`,
    text: `[Feedback] ${payload.shopName ?? ""}: ${payload.message ?? ""}`,
  };
}
