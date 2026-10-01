// R-18 — LINE push quota per OA + economy mode (04#R-18). Pure integer math; steps 6–7 (record skipped / 80% owner alert) live in the server.

/** marketing stops at 70% of the monthly quota */
const MARKETING_STOP_PERCENT = 70;
/** helpful stops at 90% — the last 10% is reserved for essential */
const HELPFUL_STOP_PERCENT = 90;

/** used/quota ≥ percent%, without floats */
const reached = (used: number, quota: number, percent: number) => used * 100 >= quota * percent;

export function decideLinePush(input: {
  monthlyQuota: number;
  usedThisMonth: number;
  messageClass: "essential" | "helpful" | "marketing";
  economyMode: boolean;
  economyBehavior: "send" | "skip";
}): { send: boolean; skipReason: "quota_exhausted" | "economy_mode" | null } {
  const { monthlyQuota: quota, usedThisMonth: used } = input;

  // 1. quota used up → skip for every class
  if (used >= quota) return { send: false, skipReason: "quota_exhausted" };

  // 2. economy mode on and the template says skip
  if (input.economyMode && input.economyBehavior === "skip") return { send: false, skipReason: "economy_mode" };

  // 3. marketing: ≥ 70% used → skip (keep quota)
  if (input.messageClass === "marketing" && reached(used, quota, MARKETING_STOP_PERCENT)) {
    return { send: false, skipReason: "quota_exhausted" };
  }

  // 4. helpful: ≥ 90% used → skip (reserve 10% for essential)
  if (input.messageClass === "helpful" && reached(used, quota, HELPFUL_STOP_PERCENT)) {
    return { send: false, skipReason: "quota_exhausted" };
  }

  // 5. essential (and anything below its threshold) sends until the quota runs out
  return { send: true, skipReason: null };
}
