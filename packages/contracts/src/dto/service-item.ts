import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { coatGroup, recordStatus, serviceCategory, serviceScope, species } from "../enums.ts";
export const ServiceItem = z.object({
  id: Uuid,
  scope: serviceScope,
  category: serviceCategory,
  nameTh: z.string(),
  description: z.string().nullable(),
  photoUrl: z.string().nullable(),
  speciesAllowed: z.array(species),
  isAddon: z.boolean(),
  addonPerDay: z.boolean(),
  onlineBookable: z.boolean(),
  estCostSatang: Money.nullable(),
  sortOrder: z.number().int(),
  status: recordStatus,
  prices: z.array(z.object({ sizeTierId: Uuid.nullable(), coatGroup, priceSatang: Money, durationMinutes: z.number().int() })),
  addonForServiceIds: z.array(Uuid),
  fromPriceSatang: Money.nullable(),
});
export type ServiceItem = z.infer<typeof ServiceItem>;
