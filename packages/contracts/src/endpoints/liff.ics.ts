import { z } from "zod";
import { Uuid } from "../common.ts";

export const LiffIcsParams = z.object({ branchSlug: z.string().min(1), bookingId: Uuid });
export const LiffIcsRequest = LiffIcsParams;
export type LiffIcsRequest = z.infer<typeof LiffIcsRequest>;
/** `text/calendar` body (RFC 5545) */
export const LiffIcsResponse = z.string().startsWith("BEGIN:VCALENDAR");
export type LiffIcsResponse = z.infer<typeof LiffIcsResponse>;
