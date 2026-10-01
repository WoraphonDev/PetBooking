// Extra R-24 cases beyond docs/spec/vectors (boundaries + Q-0005).
import { describe, expect, it } from "vitest";
import { checkPasswordPolicy, loginAttempt } from "../../../src/auth/lockout.ts";

const NOW = "2026-10-05T03:00:00.000Z";

describe("loginAttempt", () => {
  it("first failure counts 1 without locking", () => {
    expect(loginAttempt({ now: NOW, failedLoginCount: 0, lockedUntil: null, passwordCorrect: false })).toEqual({
      allowed: false,
      failedLoginCount: 1,
      lockedUntil: null,
      error: "INVALID_CREDENTIALS",
    });
  });

  it("wrong password while locked keeps the lock and does not count", () => {
    const lockedUntil = "2026-10-05T03:15:00.000Z";
    expect(loginAttempt({ now: "2026-10-05T03:14:59.999Z", failedLoginCount: 0, lockedUntil, passwordCorrect: false })).toEqual({
      allowed: false,
      failedLoginCount: 0,
      lockedUntil,
      error: "ACCOUNT_LOCKED",
    });
  });

  it("wrong password after the lock expired starts counting again from the stored count", () => {
    expect(loginAttempt({ now: NOW, failedLoginCount: 0, lockedUntil: "2026-10-05T02:59:00.000Z", passwordCorrect: false })).toEqual({
      allowed: false,
      failedLoginCount: 1,
      lockedUntil: null,
      error: "INVALID_CREDENTIALS",
    });
  });
});

describe("checkPasswordPolicy", () => {
  it("accepts exactly 8 and 128 characters", () => {
    expect(checkPasswordPolicy({ password: "abcdefg1" })).toEqual({ ok: true, error: null });
    expect(checkPasswordPolicy({ password: "a".repeat(128) })).toEqual({ ok: true, error: null });
  });

  it("rejects 7 characters as too short (even if all digits)", () => {
    expect(checkPasswordPolicy({ password: "1234567" })).toEqual({ ok: false, error: "PASSWORD_TOO_SHORT" });
  });

  it("rejects more than 128 characters as PASSWORD_TOO_LONG (Q-0005)", () => {
    expect(checkPasswordPolicy({ password: "a".repeat(129) })).toEqual({ ok: false, error: "PASSWORD_TOO_LONG" });
  });

  it("counts Thai characters one by one", () => {
    expect(checkPasswordPolicy({ password: "รหัสผ่านดี" })).toEqual({ ok: true, error: null });
  });

  it("allows a password that only contains the email local part", () => {
    expect(checkPasswordPolicy({ password: "somchai.pet1", email: "somchai.pet@example.com" })).toEqual({ ok: true, error: null });
    expect(checkPasswordPolicy({ password: "somchai.pet", email: null })).toEqual({ ok: true, error: null });
  });
});
