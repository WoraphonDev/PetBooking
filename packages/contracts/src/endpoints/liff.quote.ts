import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { Quote } from "../dto/quote.ts";

export const LiffQuoteParams = z.object({ branchSlug: z.string().min(1) });
/** one grooming appointment picked from liff.groomSlots (slot = startsAt + groomerId + stationId) */
export const LiffQuoteGroomItem = z
  .object({
    petId: Uuid,
    serviceIds: z.array(Uuid).min(1),
    addonIds: z.array(Uuid).default([]),
    startsAt: IsoInstant,
    groomerId: Uuid,
    stationId: Uuid,
    /** the customer's size choice when the pet has no weight */
    sizeTierId: Uuid.optional(),
  })
  .strict();
export const LiffQuoteRequest = z
  .object({
    groom: z.array(LiffQuoteGroomItem).default([]),
    /** T-0176 quotes grooming only; hotel / daycare items arrive with their LIFF cards (05 lists the arrays) */
    stays: z.array(z.unknown()).max(0).default([]),
    daycare: z.array(z.unknown()).max(0).default([]),
  })
  .strict()
  .refine((b) => b.groom.length > 0, { path: ["groom"], message: "at least one item" });
export type LiffQuoteRequest = z.infer<typeof LiffQuoteRequest>;
export const LiffQuoteResponse = Quote;
export type LiffQuoteResponse = z.infer<typeof LiffQuoteResponse>;
