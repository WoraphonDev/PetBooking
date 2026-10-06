// 07 §1 customer.no_show (LINE push). moneyLine comes ready from the no-show services ("" when nothing is forfeited) —
// then the first line ends at "ตามนัด" without a trailing space.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.no_show"]): Rendered {
  const first = `วันนี้ไม่พบ${payload.petName ?? ""}ตามนัด ${payload.moneyLine ?? ""}`.trimEnd();
  const text = `${first}\nนัดใหม่ได้ที่ ${payload.bookAgainUrl ?? ""}`;
  return { text, ...(payload.bookAgainUrl ? { url: String(payload.bookAgainUrl) } : {}) };
}
