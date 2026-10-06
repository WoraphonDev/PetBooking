import { z } from "zod";
import { Uuid } from "../common.ts";

/** 05#dto-LiffSession — result of opening LIFF */
export const LiffSession = z.object({
  registered: z.boolean(),
  linkPending: z.boolean(),
  profile: z.object({ displayName: z.string().nullable(), pictureUrl: z.string().nullable() }),
  customerId: Uuid.nullable(),
  legalVersions: z.object({ privacy: z.string(), terms: z.string() }),
});
export type LiffSession = z.infer<typeof LiffSession>;
