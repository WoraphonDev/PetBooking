// A-03 form rules (06#scr-A-03): new password follows R-24, confirmation must match and is never sent to the server.
import type { AuthResetConfirmRequest } from "@app/contracts/endpoints/auth.resetConfirm";
import { checkPasswordPolicy } from "@app/domain/auth/lockout";

export type PolicyState = "empty" | "ok" | "PASSWORD_TOO_SHORT" | "PASSWORD_TOO_LONG" | "PASSWORD_ALL_DIGITS" | "PASSWORD_SAME_AS_EMAIL";

/** Strength indicator = the R-24 policy result (the reset link carries no email, so the email rule is checked by the server). */
export function policyState(password: string): PolicyState {
  if (password === "") return "empty";
  const result = checkPasswordPolicy({ password });
  return result.ok ? "ok" : (result.error as PolicyState);
}

export function canSubmit(newPassword: string, confirmPassword: string): boolean {
  return policyState(newPassword) === "ok" && newPassword === confirmPassword;
}

export function resetBody(token: string, newPassword: string): AuthResetConfirmRequest {
  return { token, newPassword };
}
