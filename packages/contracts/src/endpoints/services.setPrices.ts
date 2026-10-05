import { z } from "zod";
import { Uuid } from "../common.ts";
import { ServiceItem } from "../dto/service-item.ts";
import { coatGroup } from "../enums.ts";

export const ServicesSetPricesParams = z.object({ serviceId: Uuid });
/** the whole price table of the default rate plan; one row per (size tier, coat group) */
export const ServicesSetPricesRequest = z
  .object({
    prices: z.array(
      z.object({
        /** null = every size */
        sizeTierId: Uuid.nullable().optional(),
        coatGroup,
        priceSatang: z.number().int().min(0).max(10_000_000),
        durationMinutes: z.number().int().min(0).max(600),
      }),
    ),
  })
  .refine((b) => new Set(b.prices.map((p) => `${p.sizeTierId ?? "all"}|${p.coatGroup}`)).size === b.prices.length, {
    path: ["prices"],
    message: "one row per size tier and coat group",
  });
export type ServicesSetPricesRequest = z.infer<typeof ServicesSetPricesRequest>;
export const ServicesSetPricesResponse = ServiceItem;
export type ServicesSetPricesResponse = z.infer<typeof ServicesSetPricesResponse>;
