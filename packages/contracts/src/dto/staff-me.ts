import { z } from "zod";
import { Uuid } from "../common.ts";
import { orgStatus, staffRole } from "../enums.ts";

export const StaffMe = z.object({
  staff: z.object({
    id: Uuid,
    displayName: z.string(),
    email: z.string().email(),
    role: staffRole,
    isGroomer: z.boolean(),
    lineLinked: z.boolean(),
  }),
  organization: z.object({ id: Uuid, name: z.string(), status: orgStatus }),
  branch: z.object({
    id: Uuid,
    name: z.string(),
    bookingSlug: z.string(),
    timezone: z.string(),
    modules: z.object({ grooming: z.boolean(), hotel: z.boolean(), daycare: z.boolean() }),
  }),
  permissions: z.array(z.string()),
  supportMode: z.boolean(),
});
export type StaffMe = z.infer<typeof StaffMe>;
