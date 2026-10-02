// R-08 — hold and approval deadlines for an online booking (04#R-08). Pure: the creation instant comes from the input.

const MINUTE_MS = 60_000;

function addMinutes(instant: string, minutes: number): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new RangeError(`invalid instant: ${instant}`);
  return new Date(ms + minutes * MINUTE_MS).toISOString();
}

export function computeBookingDeadlines(input: {
  createdAt: string;
  depositRequiredSatang: number;
  requiresApproval: boolean;
  holdMinutes: number;
  approvalTimeoutMinutes: number;
}): { holdExpiresAt: string | null; approvalDueAt: string | null } {
  return {
    // 1. a deposit is due → the slot is held for hold_minutes (awaiting_deposit, job expire_hold)
    holdExpiresAt: input.depositRequiredSatang > 0 ? addMinutes(input.createdAt, input.holdMinutes) : null,
    // 2. the shop must approve → approval due after approval_timeout_minutes (job approval_overdue)
    approvalDueAt: input.requiresApproval ? addMinutes(input.createdAt, input.approvalTimeoutMinutes) : null,
  };
}
