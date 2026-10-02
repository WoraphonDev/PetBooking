import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { linkRequestStatus } from "../enums.ts";
import { CustomerListItem } from "./customer-list-item.ts";

/** 05#dto-LinkRequestItem — a LINE account asking to be matched with an existing customer. */
export const LinkRequestItem = z.object({
  id: Uuid,
  lineDisplayName: z.string().nullable(),
  linePictureUrl: z.string().nullable(),
  phoneEntered: z.string(),
  candidate: CustomerListItem,
  status: linkRequestStatus,
  createdAt: IsoInstant,
});
export type LinkRequestItem = z.infer<typeof LinkRequestItem>;
