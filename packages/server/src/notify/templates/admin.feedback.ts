// admin.feedback — 07 §1 text; email subject per Q-0060 (stub text: the template task for this key replaces the body).
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";
import type { Rendered } from "./index.ts";

const TEXT = "[Feedback] {shopName}: {message}";

export function render(payload: NotificationPayloads["admin.feedback"]): Rendered {
  return { subject: fill("[Feedback] {shopName}", payload), text: fill(TEXT, payload) };
}
