// 06#scr-C-34 — PromptPay account form: R-30 id check, the test QR (฿1) and the branch.setPromptpay body.
import type { BranchSettings } from "@app/contracts/dto/branch-settings";
import type { BranchSetPromptpayRequest } from "@app/contracts/endpoints/branch.setPromptpay";
import type { PromptpayType } from "@app/contracts/enums";
import { promptPayPayload } from "@app/domain/payment/promptpay";

/** QR ทดสอบ ฿1 = R-30 amount 100 satang */
export const TEST_AMOUNT_SATANG = 100;

export type PromptpayForm = { type: PromptpayType | null; id: string; accountName: string; password: string };
export const formFrom = (p: BranchSettings["promptpay"]): PromptpayForm => ({
  type: p.type,
  // the full id is never sent back (idMasked) — the owner types it again to change the account
  id: "",
  accountName: p.accountName ?? "",
  password: "",
});

/** R-30 payload for ฿1 from the typed id; null while the type/id is not a valid PromptPay proxy */
export function testPayload(f: Pick<PromptpayForm, "type" | "id">): string | null {
  if (!f.type || !f.id.trim()) return null;
  const result = promptPayPayload({ type: f.type, id: f.id, amountSatang: TEST_AMOUNT_SATANG });
  return "payload" in result ? result.payload : null;
}

export type PromptpayErrors = Partial<Record<"type" | "id" | "accountName" | "password", true>>;
/** ประเภท / หมายเลข (R-30) / ชื่อบัญชี 1–80 / รหัสผ่าน บังคับ */
export function promptpayBody(f: PromptpayForm): { body: BranchSetPromptpayRequest | null; errors: PromptpayErrors } {
  const errors: PromptpayErrors = {};
  const accountName = f.accountName.trim();
  if (!f.type) errors.type = true;
  if (!testPayload(f)) errors.id = true;
  if (accountName.length < 1 || accountName.length > 80) errors.accountName = true;
  if (!f.password) errors.password = true;
  if (Object.keys(errors).length) return { body: null, errors };
  return { body: { type: f.type as PromptpayType, id: f.id.replace(/\D/g, ""), accountName, password: f.password }, errors };
}
