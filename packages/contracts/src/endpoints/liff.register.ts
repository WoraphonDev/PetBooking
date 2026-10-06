import { z } from "zod";
import { LiffSession } from "../dto/liff-session.ts";

export const LiffRegisterParams = z.object({ branchSlug: z.string().min(1) });
export const LiffRegisterRequest = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60).optional(),
    nickname: z.string().trim().max(60).optional(),
    /** R-22: normalized on the server (INVALID_PHONE) */
    phone: z.string().trim().min(1),
    /** must equal the latest privacy notice version */
    privacyVersion: z.string().min(1),
    termsVersion: z.string().min(1),
    /** true → granted, false → denied */
    photoConsent: z.boolean(),
  })
  .strict();
export type LiffRegisterRequest = z.infer<typeof LiffRegisterRequest>;
export const LiffRegisterResponse = LiffSession;
export type LiffRegisterResponse = z.infer<typeof LiffRegisterResponse>;
