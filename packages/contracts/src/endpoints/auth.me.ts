import { z } from "zod";
import { StaffMe } from "../dto/staff-me.ts";

export const AuthMeRequest = z.object({});
export type AuthMeRequest = z.infer<typeof AuthMeRequest>;
export const AuthMeResponse = StaffMe;
export type AuthMeResponse = z.infer<typeof AuthMeResponse>;
