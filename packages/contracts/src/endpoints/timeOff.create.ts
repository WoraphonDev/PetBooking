import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { AffectedServiceItem } from "../dto/affected-service-item.ts";

export const TimeOffCreateRequest = z
  .object({
    staffUserId: Uuid,
    startsAt: IsoInstant,
    endsAt: IsoInstant,
    reason: z.string().optional(),
  })
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), { path: ["endsAt"], message: "endsAt must be after startsAt" });
export type TimeOffCreateRequest = z.infer<typeof TimeOffCreateRequest>;
export const TimeOffCreateResponse = z.object({ affected: z.array(AffectedServiceItem) });
export type TimeOffCreateResponse = z.infer<typeof TimeOffCreateResponse>;
