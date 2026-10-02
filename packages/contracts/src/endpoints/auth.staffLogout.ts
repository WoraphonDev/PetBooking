import { z } from "zod";

export const AuthStaffLogoutRequest = z.object({});
export type AuthStaffLogoutRequest = z.infer<typeof AuthStaffLogoutRequest>;
export const AuthStaffLogoutResponse = z.undefined();
export type AuthStaffLogoutResponse = z.infer<typeof AuthStaffLogoutResponse>;
