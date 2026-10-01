// Password hashing (argon2id, 04#R-24 step 6) + R-24 lockout persisted on staff_user.

import { staffUser } from "@app/db/schema";
import { checkPasswordPolicy, loginAttempt } from "@app/domain/auth/lockout";
import { hash, verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { makeSystemCtx } from "../context.ts";
import type { Executor } from "../db.ts";
import { AppError } from "../errors.ts";
import { tenantDb } from "../repo/tenant.ts";

/** argon2id is the library default; parameters from 04#R-24 */
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password).catch(() => false);
}

/** For setting a new password: R-24 policy first, then hash. Violations → PASSWORD_POLICY with details.reason. */
export async function hashNewPassword(password: string, email?: string | null): Promise<string> {
  const policy = checkPasswordPolicy({ password, email: email ?? null });
  if (!policy.ok) throw new AppError("PASSWORD_POLICY", { reason: policy.error });
  return hashPassword(password);
}

type LoginStaff = { id: string; organizationId: string; passwordHash: string | null; failedLoginCount: number; lockedUntil: Date | null };

/**
 * Applies R-24 to one login attempt and saves failed_login_count / locked_until (/ last_login_at on success).
 * Returns instead of throwing so the caller can commit the counters, then throw `new AppError(result.error)`.
 */
export async function verifyStaffLogin(
  tx: Executor,
  staff: LoginStaff,
  password: string,
  now: Date,
): Promise<{ ok: true; error: null } | { ok: false; error: "ACCOUNT_LOCKED" | "INVALID_CREDENTIALS" }> {
  // R-24 step 1: while locked the password is not checked at all
  const locked = staff.lockedUntil !== null && now.getTime() < staff.lockedUntil.getTime();
  const passwordCorrect = !locked && staff.passwordHash !== null && (await verifyPassword(staff.passwordHash, password));
  const r = loginAttempt({
    now: now.toISOString(),
    failedLoginCount: staff.failedLoginCount,
    lockedUntil: staff.lockedUntil?.toISOString() ?? null,
    passwordCorrect,
  });
  await tenantDb(makeSystemCtx(staff.organizationId, now), tx).update(
    staffUser,
    {
      failedLoginCount: r.failedLoginCount,
      lockedUntil: r.lockedUntil === null ? null : new Date(r.lockedUntil),
      ...(r.allowed ? { lastLoginAt: now } : {}),
    },
    eq(staffUser.id, staff.id),
  );
  return r.allowed ? { ok: true, error: null } : { ok: false, error: r.error ?? "INVALID_CREDENTIALS" };
}

let dummyHash: Promise<string> | null = null;
/** Unknown email: spend the same argon2 time as a real check so timing doesn't reveal which emails exist (R-24 step 4). */
export async function verifyUnknownUserPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword("unknown-user-placeholder");
  await verifyPassword(await dummyHash, password);
  return false;
}
