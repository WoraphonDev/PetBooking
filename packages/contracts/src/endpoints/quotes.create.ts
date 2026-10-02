import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { Quote } from "../dto/quote.ts";
import { groomerPreference } from "../enums.ts";

export const QuotesCreateRequest = z.object({
  customerId: Uuid,
  groom: z
    .array(
      z.object({
        petId: Uuid,
        serviceIds: z.array(Uuid).min(1),
        addonIds: z.array(Uuid).default([]),
        startsAt: IsoInstant,
        groomerId: Uuid,
        stationId: Uuid,
        groomerPreference,
        sizeTierId: Uuid.optional(),
        customerPackageId: Uuid.optional(),
      }),
    )
    .default([]),
  // Hotel/daycare extension cards own nonempty inputs; never silently price an unsupported module as zero.
  stays: z.array(z.never()).default([]),
  daycare: z.array(z.never()).default([]),
});
export type QuotesCreateRequest = z.infer<typeof QuotesCreateRequest>;
export const QuotesCreateResponse = Quote;
export type QuotesCreateResponse = z.infer<typeof QuotesCreateResponse>;
