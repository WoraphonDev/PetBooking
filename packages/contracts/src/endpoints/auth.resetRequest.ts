import { z } from "zod";

export const AuthResetRequestRequest = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
});
export type AuthResetRequestRequest = z.infer<typeof AuthResetRequestRequest>;
export const AuthResetRequestResponse = z.undefined();
export type AuthResetRequestResponse = z.infer<typeof AuthResetRequestResponse>;
