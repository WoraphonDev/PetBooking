import { z } from "zod";

export const StaffMePushSubscribeRequest = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});
export type StaffMePushSubscribeRequest = z.infer<typeof StaffMePushSubscribeRequest>;
/** 204 No Content */
export const StaffMePushSubscribeResponse = z.undefined();
export type StaffMePushSubscribeResponse = z.infer<typeof StaffMePushSubscribeResponse>;
