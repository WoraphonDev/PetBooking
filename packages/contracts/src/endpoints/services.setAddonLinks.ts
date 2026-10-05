import { z } from "zod";
import { Uuid } from "../common.ts";
import { ServiceItem } from "../dto/service-item.ts";
export const ServicesSetAddonLinksParams = z.object({ serviceId: Uuid });
/** [] = the add-on applies to every service in the same scope. */
export const ServicesSetAddonLinksRequest = z.object({ baseServiceIds: z.array(Uuid) });
export type ServicesSetAddonLinksRequest = z.infer<typeof ServicesSetAddonLinksRequest>;
export const ServicesSetAddonLinksResponse = ServiceItem;
export type ServicesSetAddonLinksResponse = z.infer<typeof ServicesSetAddonLinksResponse>;
