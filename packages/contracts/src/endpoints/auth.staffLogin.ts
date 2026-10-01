import { z } from "zod";
import { StaffMe } from "../dto/staff-me.ts";

export const AuthStaffLoginRequest = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
});
export type AuthStaffLoginRequest = z.infer<typeof AuthStaffLoginRequest>;
export const AuthStaffLoginResponse = StaffMe;
export type AuthStaffLoginResponse = z.infer<typeof AuthStaffLoginResponse>;
