// owner.support_access — 07 §1 text; email subject per Q-0060 (stub text: the template task for this key replaces the body).
import type { NotificationPayloads } from "../keys.ts";
import { fill } from "./fill.ts";
import type { Rendered } from "./index.ts";

const TEXT = "ทีมงานเข้าดูข้อมูลร้านเพื่อช่วยเหลือ: {reason}";

export function render(payload: NotificationPayloads["owner.support_access"]): Rendered {
  return { subject: "ทีมงานเข้าดูข้อมูลร้านของคุณ", text: fill(TEXT, payload) };
}
