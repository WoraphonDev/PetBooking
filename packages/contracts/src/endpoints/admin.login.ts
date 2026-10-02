import { z } from "zod";
import { Uuid } from "../common.ts";

export const AdminLoginRequest = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
});
export type AdminLoginRequest = z.infer<typeof AdminLoginRequest>;
export const AdminLoginResponse = z.object({ admin: z.object({ id: Uuid, email: z.string().email(), displayName: z.string() }) });
export type AdminLoginResponse = z.infer<typeof AdminLoginResponse>;
