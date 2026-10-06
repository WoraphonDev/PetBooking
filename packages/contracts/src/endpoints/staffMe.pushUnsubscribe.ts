import { z } from "zod";

export const StaffMePushUnsubscribeRequest = z.object({ endpoint: z.string().min(1) });
export type StaffMePushUnsubscribeRequest = z.infer<typeof StaffMePushUnsubscribeRequest>;
/** 204 No Content */
export const StaffMePushUnsubscribeResponse = z.undefined();
export type StaffMePushUnsubscribeResponse = z.infer<typeof StaffMePushUnsubscribeResponse>;
