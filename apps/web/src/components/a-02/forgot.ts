// A-02 form rules (06#scr-A-02): email required; the request is normalized like the 05 contract (trim + lowercase).
import type { AuthResetRequestRequest } from "@app/contracts/endpoints/auth.resetRequest";

export function resetRequestBody(email: string): AuthResetRequestRequest {
  return { email: email.trim().toLowerCase() };
}

export function isComplete(email: string): boolean {
  return email.trim() !== "";
}
