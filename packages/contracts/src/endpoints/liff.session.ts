import { z } from "zod";
import { LiffSession } from "../dto/liff-session.ts";

export const LiffSessionParams = z.object({ branchSlug: z.string().min(1) });
export type LiffSessionParams = z.infer<typeof LiffSessionParams>;
export const LiffSessionRequest = z.object({
  idToken: z.string().min(1),
});
export type LiffSessionRequest = z.infer<typeof LiffSessionRequest>;
export const LiffSessionResponse = LiffSession;
export type LiffSessionResponse = z.infer<typeof LiffSessionResponse>;
