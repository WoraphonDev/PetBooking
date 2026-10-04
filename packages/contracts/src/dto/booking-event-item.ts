import { z } from "zod";
import { IsoInstant } from "../common.ts";
import { actorType } from "../enums.ts";

/** 05#dto-BookingEventItem — one status change on a booking or its children. */
export const BookingEventItem = z.object({
  entityType: z.string(),
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  actorType,
  reason: z.string().nullable(),
  at: IsoInstant,
});
export type BookingEventItem = z.infer<typeof BookingEventItem>;
