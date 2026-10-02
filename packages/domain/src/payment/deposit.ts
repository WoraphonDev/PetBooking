// R-06 — deposit per booking (04#R-06) from the branch policy and the customer's reliability (R-09). Integer satang only.

type DepositInput = {
  estimatedTotalSatang: number;
  policy: { type: "none" | "fixed" | "percent"; value: number };
  customer: { depositExempt: boolean; reliabilityLevel: 1 | 2 | 3 | 4 };
};
type DepositReason = "exempt" | "reliability_full_prepay" | "reliability_min_30" | "policy_none" | "policy_fixed" | "policy_percent";

const WATCH_MIN_PERCENT = 30;

/** ceil(total × pct / 10000) × 100 — a percentage rounded up to whole baht, never above the total */
function percentOf(total: number, pct: number): number {
  const product = total * pct;
  if (!Number.isSafeInteger(product)) throw new RangeError("deposit amount out of safe integer range");
  return Math.min(Math.floor((product + 9999) / 10000) * 100, total);
}

export function computeDeposit(input: DepositInput): { depositRequiredSatang: number; reason: DepositReason } {
  const total = input.estimatedTotalSatang;
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError(`estimatedTotalSatang must be a non-negative integer: ${total}`);
  const { depositExempt, reliabilityLevel } = input.customer;
  // 1. exempt customers never pay a deposit
  if (depositExempt) return { depositRequiredSatang: 0, reason: "exempt" };
  // 2. high risk pays the whole estimate up front (and the booking needs approval, R-08)
  if (reliabilityLevel === 1) return { depositRequiredSatang: total, reason: "reliability_full_prepay" };

  // 3–4. branch policy
  const policy: { depositRequiredSatang: number; reason: DepositReason } =
    input.policy.type === "percent"
      ? { depositRequiredSatang: percentOf(total, input.policy.value), reason: "policy_percent" }
      : input.policy.type === "fixed"
        ? { depositRequiredSatang: Math.min(input.policy.value, total), reason: "policy_fixed" }
        : { depositRequiredSatang: 0, reason: "policy_none" };

  // 5. watch level: at least 30% (whole baht) even when the policy asks for less
  if (reliabilityLevel === 2) {
    const minimum = percentOf(total, WATCH_MIN_PERCENT);
    if (policy.depositRequiredSatang < minimum) return { depositRequiredSatang: minimum, reason: "reliability_min_30" };
  }
  // 6. 0 → the caller sets booking.deposit_status = not_required
  return policy;
}
