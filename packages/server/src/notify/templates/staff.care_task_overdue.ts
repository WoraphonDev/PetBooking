// 07 §1 staff.care_task_overdue: Web Push to every active staff of the branch.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.care_task_overdue"]): Rendered {
  return { text: `⚠️ เลยเวลา: ${payload.title ?? ""} — ${payload.petName ?? ""} ห้อง ${payload.roomCode ?? ""}` };
}
