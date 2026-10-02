import { z } from "zod";
import { StaffMe } from "../dto/staff-me.ts";

export const AuthInviteAcceptRequest = z.object({
  token: z.string().min(1),
  displayName: z.string().trim().min(1).max(40),
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase())
    .optional(),
  // R-24 policy is checked by the service (PASSWORD_POLICY); omitted = LINE login only
  password: z.string().optional(),
});
export type AuthInviteAcceptRequest = z.infer<typeof AuthInviteAcceptRequest>;
export const AuthInviteAcceptResponse = StaffMe;
export type AuthInviteAcceptResponse = z.infer<typeof AuthInviteAcceptResponse>;
