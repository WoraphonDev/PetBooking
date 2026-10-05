import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { staffRole, staffStatus } from "../enums.ts";
import { WorkingHours } from "./working-hours.ts";

/** 05#dto-StaffUserItem — one staff member. */
export const StaffUserItem = z.object({
  id: Uuid,
  displayName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: staffRole,
  isGroomer: z.boolean(),
  status: staffStatus,
  sortOrder: z.number().int(),
  photoUrl: z.string().nullable(),
  lineLinked: z.boolean(),
  lastLoginAt: IsoInstant.nullable(),
  workingHours: z.array(WorkingHours),
});
export type StaffUserItem = z.infer<typeof StaffUserItem>;
/** 05#ep-staffUsers.list: role staff sees only these keys (the others are left out) */
export const StaffUserPublicItem = StaffUserItem.pick({ id: true, displayName: true, isGroomer: true, photoUrl: true }).strict();
export type StaffUserPublicItem = z.infer<typeof StaffUserPublicItem>;
