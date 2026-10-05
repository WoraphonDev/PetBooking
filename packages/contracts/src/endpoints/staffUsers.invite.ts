import { z } from "zod";
import { StaffUserItem } from "../dto/staff-user-item.ts";
import { staffRole } from "../enums.ts";

export const StaffUsersInviteRequest = z.object({
  displayName: z.string().trim().min(1).max(40),
  /** none = invite through the returned link (LINE) */
  email: z
    .email()
    .transform((e) => e.toLowerCase())
    .optional(),
  role: staffRole,
  isGroomer: z.boolean(),
});
export type StaffUsersInviteRequest = z.infer<typeof StaffUsersInviteRequest>;
export const StaffUsersInviteResponse = z.object({ staffUser: StaffUserItem, inviteUrl: z.string() });
export type StaffUsersInviteResponse = z.infer<typeof StaffUsersInviteResponse>;
