// 07 §1 owner.line_error: Web Push / email to the branch owners when LINE answers 401 and line_channel.status becomes error (01 §7, Q-1029).
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["owner.line_error"]): Rendered {
  return {
    text: `⚠️ การเชื่อมต่อ LINE OA ของสาขา ${payload.branchName ?? ""} ขาด ลูกค้าจะไม่ได้รับข้อความ — กรุณาติดต่อทีมงานเพื่อตรวจสอบ token`,
  };
}
