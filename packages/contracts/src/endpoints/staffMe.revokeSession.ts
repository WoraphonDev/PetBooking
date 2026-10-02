import { z } from "zod";
import { Uuid } from "../common.ts";

export const StaffMeRevokeSessionParams = z.object({ sessionId: Uuid });
export const StaffMeRevokeSessionRequest = z.object({});
export type StaffMeRevokeSessionRequest = z.infer<typeof StaffMeRevokeSessionRequest>;
export const StaffMeRevokeSessionResponse = z.undefined();
export type StaffMeRevokeSessionResponse = z.infer<typeof StaffMeRevokeSessionResponse>;
