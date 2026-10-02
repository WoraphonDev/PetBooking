// A-01 form rules (06#scr-A-01): email trim+lowercase, both fields required; after login → /console or /staff by role.

import type { StaffMe } from "@app/contracts/dto/staff-me";
import type { AuthStaffLoginRequest } from "@app/contracts/endpoints/auth.staffLogin";

export function loginBody(email: string, password: string): AuthStaffLoginRequest {
  return { email: email.trim().toLowerCase(), password };
}

export function isComplete(email: string, password: string): boolean {
  return email.trim() !== "" && password !== "";
}

export function destinationFor(me: StaffMe): "/console" | "/staff" {
  return me.staff.role === "staff" ? "/staff" : "/console";
}
