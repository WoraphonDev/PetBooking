import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";

/** no query parameters */
export const StaffMeSessionsRequest = z.strictObject({});
export type StaffMeSessionsRequest = z.infer<typeof StaffMeSessionsRequest>;
export const StaffMeSessionsResponse = z.array(
  z.object({ id: Uuid, userAgent: z.string().nullable(), lastSeenAt: IsoInstant, current: z.boolean() }),
);
export type StaffMeSessionsResponse = z.infer<typeof StaffMeSessionsResponse>;
