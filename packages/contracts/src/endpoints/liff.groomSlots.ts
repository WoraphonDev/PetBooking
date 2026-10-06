import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { SlotList } from "../dto/slot-list.ts";

export const LiffGroomSlotsParams = z.object({ branchSlug: z.string().min(1) });
export const LiffGroomSlotsRequest = z
  .object({
    date: LocalDate.pipe(z.iso.date()),
    /** one of the customer's own pets */
    petId: Uuid,
    /** ≥ 1 online-bookable main grooming service */
    serviceIds: z.array(Uuid).min(1),
    addonIds: z.array(Uuid).default([]),
    /** absent = any groomer */
    groomerId: Uuid.optional(),
    /** the customer picks a size when the pet has no weight */
    sizeTierId: Uuid.optional(),
  })
  .strict();
export type LiffGroomSlotsRequest = z.infer<typeof LiffGroomSlotsRequest>;
export const LiffGroomSlotsResponse = SlotList;
export type LiffGroomSlotsResponse = z.infer<typeof LiffGroomSlotsResponse>;
