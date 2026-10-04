import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { ServiceItem } from "../dto/service-item.ts";
import { serviceCategory, serviceScope, species } from "../enums.ts";
export const ServiceFields = z.strictObject({
  scope: serviceScope,
  category: serviceCategory,
  nameTh: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  photoFileId: Uuid.optional(),
  speciesAllowed: z.array(species).optional(),
  isAddon: z.boolean(),
  addonPerDay: z.boolean().optional(),
  onlineBookable: z.boolean().optional(),
  estCostSatang: Money.nonnegative().optional(),
  sortOrder: z.number().int().optional(),
});
export function validService(fields: { scope: string; category: string; isAddon: boolean; addonPerDay?: boolean }): boolean {
  return (
    !(fields.category === "hotel_addon" && fields.scope !== "hotel") &&
    !(fields.category === "daycare_addon" && fields.scope !== "daycare") &&
    (!fields.addonPerDay || (fields.scope === "hotel" && fields.isAddon))
  );
}
export const ServicesCreateRequest = ServiceFields.refine(validService, { message: "incompatible service category or per-day add-on" });
export type ServicesCreateRequest = z.infer<typeof ServicesCreateRequest>;
export const ServicesCreateResponse = ServiceItem;
export type ServicesCreateResponse = z.infer<typeof ServicesCreateResponse>;
