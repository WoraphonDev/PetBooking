import { z } from "zod";

export const AuthResetConfirmRequest = z.object({
  token: z.string(),
  newPassword: z.string(),
});
export type AuthResetConfirmRequest = z.infer<typeof AuthResetConfirmRequest>;
export const AuthResetConfirmResponse = z.undefined();
export type AuthResetConfirmResponse = z.infer<typeof AuthResetConfirmResponse>;
