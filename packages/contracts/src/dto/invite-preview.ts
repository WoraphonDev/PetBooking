import { z } from "zod";
import { staffRole } from "../enums.ts";

/** 05#dto-InvitePreview (Q-0044): what A-04 shows before the invite is accepted. */
export const InvitePreview = z.object({ orgName: z.string(), role: staffRole, hasEmail: z.boolean() });
export type InvitePreview = z.infer<typeof InvitePreview>;
