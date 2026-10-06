import { z } from "zod";
import { MyProfile } from "../dto/my-profile.ts";

export const LiffMeParams = z.object({ branchSlug: z.string().min(1) });
export const LiffMeRequest = LiffMeParams;
export type LiffMeRequest = z.infer<typeof LiffMeRequest>;
export const LiffMeResponse = MyProfile;
export type LiffMeResponse = z.infer<typeof LiffMeResponse>;
