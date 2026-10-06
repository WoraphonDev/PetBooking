import { z } from "zod";
import { StaffMe } from "../dto/staff-me.ts";

export const StaffMeLinkLineRequest = z.object({
  /** LINE ID token from the platform's LINE Login */
  idToken: z.string().min(1),
});
export type StaffMeLinkLineRequest = z.infer<typeof StaffMeLinkLineRequest>;
export const StaffMeLinkLineResponse = StaffMe;
export type StaffMeLinkLineResponse = z.infer<typeof StaffMeLinkLineResponse>;
