import { z } from "zod";
import { StaffMe } from "../dto/staff-me.ts";

export const AuthStaffLineRequest = z.object({
  /** LINE ID token from the platform's LINE Login */
  idToken: z.string().min(1),
});
export type AuthStaffLineRequest = z.infer<typeof AuthStaffLineRequest>;
export const AuthStaffLineResponse = StaffMe;
export type AuthStaffLineResponse = z.infer<typeof AuthStaffLineResponse>;
