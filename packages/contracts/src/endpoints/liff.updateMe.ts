import { z } from "zod";
import { MyProfile } from "../dto/my-profile.ts";

export const LiffUpdateMeParams = z.object({ branchSlug: z.string().min(1) });
export const LiffUpdateMeRequest = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  nickname: z.string().trim().max(60).optional(),
  phone: z.string().trim().min(1).optional(),
  /** "" clears the address (Q-1040) */
  email: z.union([z.literal(""), z.email().max(254)]).optional(),
  photoConsent: z.boolean().optional(),
});
export type LiffUpdateMeRequest = z.infer<typeof LiffUpdateMeRequest>;
export const LiffUpdateMeResponse = MyProfile;
export type LiffUpdateMeResponse = z.infer<typeof LiffUpdateMeResponse>;
