// 07 §1 owner.quota_warning: Web Push to every active owner once LINE pushes reach 80% of the month's quota (R-18).
import type { NotificationPayloads } from "../keys.ts";

export function render(payload: NotificationPayloads["owner.quota_warning"]): { text: string } {
  return { text: `ข้อความ LINE ใช้ไป ${payload.used ?? ""}/${payload.quota ?? ""} แล้ว ระบบจะสงวนโควตาให้ข้อความสำคัญ` };
}
