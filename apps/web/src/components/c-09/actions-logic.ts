// 06#scr-C-09 ext-M3 — owner / front-desk actions: blacklist, reliability override, credit adjustment, refund.
import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import type { CustomersBlacklistRequest } from "@app/contracts/endpoints/customers.blacklist";
import type { CustomersCreditRequest } from "@app/contracts/endpoints/customers.credit";
import type { CustomersReliabilityOverrideRequest } from "@app/contracts/endpoints/customers.reliabilityOverride";
import type { RefundsCreateRequest } from "@app/contracts/endpoints/refunds.create";
import type { RefundMode, StaffRole } from "@app/contracts/enums";

export type CustomerAction = "blacklist" | "override" | "credit" | "refund";

/** แสดงเมื่อ: Blacklist / กำหนดระดับเอง / ปรับเครดิต = owner · บันทึกคืนเงิน = OF */
export function customerActions(role: StaffRole | undefined): CustomerAction[] {
  if (role === "owner") return ["blacklist", "override", "credit", "refund"];
  if (role === "front_desk") return ["refund"];
  return [];
}

/** every dialog's เหตุผล: ≥ 3 (Q-0034 also when lifting a blacklist) */
const reasonOf = (s: string) => {
  const r = s.trim();
  return r.length >= 3 ? r : null;
};

export function blacklistBody(c: Pick<CustomerDetail, "blacklisted">, reason: string): CustomersBlacklistRequest | null {
  const r = reasonOf(reason);
  return r ? { blacklisted: !c.blacklisted, reason: r } : null;
}

/** level 1–4, or "auto" = back to the R-09 value (null) */
export function overrideBody(level: 1 | 2 | 3 | 4 | "auto", reason: string): CustomersReliabilityOverrideRequest | null {
  const r = reasonOf(reason);
  return r ? { level: level === "auto" ? null : level, reason: r } : null;
}

export type CreditForm = { sign: 1 | -1; amountSatang: number | null | undefined; reason: string };
export type CreditErrors = Partial<Record<"amountSatang" | "reason" | "balance", true>>;
/** +/− ยอด ≠ 0; the new balance must stay ≥ 0 (INSUFFICIENT_CREDIT on the server too) */
export function creditBody(f: CreditForm, balanceSatang: number): { body: CustomersCreditRequest | null; errors: CreditErrors } {
  const errors: CreditErrors = {};
  const r = reasonOf(f.reason);
  if (f.amountSatang == null || f.amountSatang <= 0) errors.amountSatang = true;
  else if (balanceSatang + f.sign * f.amountSatang < 0) errors.balance = true;
  if (!r) errors.reason = true;
  if (Object.keys(errors).length) return { body: null, errors };
  return { body: { deltaSatang: f.sign * (f.amountSatang as number), reason: r as string }, errors };
}

export type RefundForm = { amountSatang: number | null | undefined; mode: RefundMode | null; reason: string; proofFileId: string | null };
export const emptyRefund = (): RefundForm => ({ amountSatang: null, mode: null, reason: "", proofFileId: null });
export type RefundErrors = Partial<Record<"amountSatang" | "mode" | "reason", true>>;
/** refunds.create for this customer: ยอด > 0, วิธี, เหตุผล ≥ 3, หลักฐาน (แนะนำเมื่อโอน) */
export function refundBody(customerId: string, f: RefundForm): { body: RefundsCreateRequest | null; errors: RefundErrors } {
  const errors: RefundErrors = {};
  const r = reasonOf(f.reason);
  if (f.amountSatang == null || f.amountSatang <= 0) errors.amountSatang = true;
  if (!f.mode) errors.mode = true;
  if (!r) errors.reason = true;
  if (Object.keys(errors).length) return { body: null, errors };
  return {
    body: {
      customerId,
      amountSatang: f.amountSatang as number,
      mode: f.mode as RefundMode,
      reason: r as string,
      ...(f.proofFileId ? { proofFileId: f.proofFileId } : {}),
    },
    errors,
  };
}
