// 07 §1 staff.link_request: Web Push to front_desk+owner when a LINE user registers with a known phone.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["staff.link_request"]): Rendered {
  return { text: `${payload.lineName ?? ""} ขอเชื่อม LINE กับลูกค้าเบอร์ ${payload.phone ?? ""} — ตรวจสอบ` };
}
