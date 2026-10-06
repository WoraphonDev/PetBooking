// 07 §1 customer.vaccine_rejected (LINE push). petUrl is the pet's L-03 page.
import type { NotificationPayloads } from "../keys.ts";
import type { Rendered } from "./index.ts";

export function render(payload: NotificationPayloads["customer.vaccine_rejected"]): Rendered {
  const text = `หลักฐานวัคซีน ${payload.vaccineName ?? ""} ของ${payload.petName ?? ""}ยังไม่ผ่าน: ${payload.reason ?? ""}\nส่งใหม่: ${payload.petUrl ?? ""}`;
  return { text, ...(payload.petUrl ? { url: String(payload.petUrl) } : {}) };
}
