import { z } from "zod";
import { Uuid } from "../common.ts";

export const StaffUsersResendInviteRequest = z.object({ staffUserId: Uuid });
export type StaffUsersResendInviteRequest = z.infer<typeof StaffUsersResendInviteRequest>;
export const StaffUsersResendInviteResponse = z.object({ inviteUrl: z.string().url() });
export type StaffUsersResendInviteResponse = z.infer<typeof StaffUsersResendInviteResponse>;
