import { z } from "zod";
import { Uuid } from "../common.ts";

export const AdminSupportStartRequest = z.object({
  organizationId: Uuid,
  reason: z.string().trim().min(10),
  ticketRef: z.string().trim().min(1).optional(),
});
export type AdminSupportStartRequest = z.infer<typeof AdminSupportStartRequest>;
/** where the browser goes next; the support session itself travels in the `sid` cookie */
export const AdminSupportStartResponse = z.object({ redirectUrl: z.string() });
export type AdminSupportStartResponse = z.infer<typeof AdminSupportStartResponse>;
