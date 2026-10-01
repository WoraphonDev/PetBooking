// R-24 — account lockout after repeated wrong passwords + password policy (04#R-24). Pure: time comes from `now`.

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export function loginAttempt(input: { now: string; failedLoginCount: number; lockedUntil: string | null; passwordCorrect: boolean }): {
  allowed: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  error: "ACCOUNT_LOCKED" | "INVALID_CREDENTIALS" | null;
} {
  const nowMs = Date.parse(input.now);

  // 1. still locked → reject without checking the password
  if (input.lockedUntil !== null && nowMs < Date.parse(input.lockedUntil)) {
    return { allowed: false, failedLoginCount: input.failedLoginCount, lockedUntil: input.lockedUntil, error: "ACCOUNT_LOCKED" };
  }

  // 2. correct password → reset (an expired lock is cleared too)
  if (input.passwordCorrect) {
    return { allowed: true, failedLoginCount: 0, lockedUntil: null, error: null };
  }

  // 3. 5th consecutive failure → lock 15 minutes and reset the counter
  const failed = input.failedLoginCount + 1;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    return { allowed: false, failedLoginCount: 0, lockedUntil: new Date(nowMs + LOCK_MS).toISOString(), error: "ACCOUNT_LOCKED" };
  }

  // 4. same error whether or not the email exists
  return { allowed: false, failedLoginCount: failed, lockedUntil: null, error: "INVALID_CREDENTIALS" };
}

export function checkPasswordPolicy(input: { password: string; email?: string | null }): { ok: boolean; error: string | null } {
  const { password } = input;
  // count characters (code points), not UTF-16 units
  const length = [...password].length;

  // 5. 8–128 characters, not all digits, not equal to the email's local part (case-insensitive)
  if (length < PASSWORD_MIN) return { ok: false, error: "PASSWORD_TOO_SHORT" };
  // PASSWORD_TOO_LONG: not named in 04 — decided in Q-0005
  if (length > PASSWORD_MAX) return { ok: false, error: "PASSWORD_TOO_LONG" };
  if (/^\d+$/.test(password)) return { ok: false, error: "PASSWORD_ALL_DIGITS" };
  const localPart = input.email?.split("@")[0]?.toLowerCase();
  if (localPart && password.toLowerCase() === localPart) return { ok: false, error: "PASSWORD_SAME_AS_EMAIL" };

  return { ok: true, error: null };
}
