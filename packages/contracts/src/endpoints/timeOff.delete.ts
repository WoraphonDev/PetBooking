import { z } from "zod";
import { Uuid } from "../common.ts";

export const TimeOffDeleteRequest = z.object({ timeOffId: Uuid });
export type TimeOffDeleteRequest = z.infer<typeof TimeOffDeleteRequest>;
export const TimeOffDeleteResponse = z.undefined();
export type TimeOffDeleteResponse = z.infer<typeof TimeOffDeleteResponse>;
