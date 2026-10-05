import { z } from "zod";
import { Uuid, Warning } from "../common.ts";
import { StaffUserItem } from "../dto/staff-user-item.ts";
import { staffRole } from "../enums.ts";

export const StaffUsersUpdateParams = z.object({ staffUserId: Uuid });
export const StaffUsersUpdateRequest = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    /** R-22 (normalised in the service) */
    phone: z.string().min(1),
    role: staffRole,
    isGroomer: z.boolean(),
    sortOrder: z.number().int(),
    photoFileId: Uuid,
    /** active ↔ disabled only */
    status: z.enum(["active", "disabled"]),
  })
  .partial()
  .strict();
export type StaffUsersUpdateRequest = z.infer<typeof StaffUsersUpdateRequest>;
/** a disabled groomer's future appointments stay — warning GROOMER_HAS_FUTURE_APPOINTMENTS (Q-0116) */
export const StaffUsersUpdateResponse = StaffUserItem.extend({ warnings: z.array(Warning).optional() });
export type StaffUsersUpdateResponse = z.infer<typeof StaffUsersUpdateResponse>;
