import { z } from "zod";
import { IsoInstant } from "../common.ts";
import { AffectedServiceItem } from "../dto/affected-service-item.ts";
import { closureScope } from "../enums.ts";

export const ClosuresCreateRequest = z
  .object({
    startsAt: IsoInstant,
    endsAt: IsoInstant,
    scope: closureScope,
    reason: z.string().max(200).optional(),
  })
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), { path: ["endsAt"], message: "endsAt must be after startsAt" });
export type ClosuresCreateRequest = z.infer<typeof ClosuresCreateRequest>;
export const ClosuresCreateResponse = z.object({ affected: z.array(AffectedServiceItem) });
export type ClosuresCreateResponse = z.infer<typeof ClosuresCreateResponse>;
