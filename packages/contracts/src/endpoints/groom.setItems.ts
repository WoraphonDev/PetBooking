import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { AppointmentCard } from "../dto/appointment-card.ts";

export const GroomSetItemsParams = z.object({ appointmentId: Uuid });
export const GroomSetItemsRequest = z
  .object({
    serviceIds: z.array(Uuid).min(1),
    addonIds: z.array(Uuid).default([]),
    /** size override (else the appointment's size tier) */
    sizeTierId: Uuid.optional(),
    /** manual price of one item; audited as booking.price_override */
    priceOverrides: z.array(z.object({ serviceId: Uuid, priceSatang: Money.nonnegative(), reason: z.string().trim().min(3) })).default([]),
  })
  .superRefine((b, issue) => {
    const ids = [...b.serviceIds, ...b.addonIds];
    if (new Set(ids).size !== ids.length) issue.addIssue({ code: "custom", path: ["serviceIds"], message: "duplicate service" });
    b.priceOverrides.forEach((o, i) => {
      if (!ids.includes(o.serviceId))
        issue.addIssue({ code: "custom", path: ["priceOverrides", i, "serviceId"], message: "not in serviceIds/addonIds" });
    });
  });
export type GroomSetItemsRequest = z.infer<typeof GroomSetItemsRequest>;
export const GroomSetItemsResponse = AppointmentCard;
export type GroomSetItemsResponse = z.infer<typeof GroomSetItemsResponse>;
