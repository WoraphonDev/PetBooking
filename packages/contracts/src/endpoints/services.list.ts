import { z } from "zod";
import { ServiceItem } from "../dto/service-item.ts";
import { serviceScope } from "../enums.ts";
export const ServicesListQuery = z.object({
  scope: serviceScope.optional(),
  includeArchived: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).default(false),
});
export type ServicesListQuery = z.infer<typeof ServicesListQuery>;
export const ServicesListRequest = ServicesListQuery;
export type ServicesListRequest = ServicesListQuery;
export const ServicesListResponse = z.array(ServiceItem);
export type ServicesListResponse = z.infer<typeof ServicesListResponse>;
