import { z } from "zod";
import { IsoInstant, Money, Paged, Uuid } from "../common.ts";

export const CustomersTimelineRequest = z.object({ customerId: Uuid });
export type CustomersTimelineRequest = z.infer<typeof CustomersTimelineRequest>;
export const CustomersTimelineQuery = z.object({
  cursor: z.string().min(1).optional(),
  // 05 §0 pagination convention
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CustomersTimelineQuery = z.infer<typeof CustomersTimelineQuery>;
export const CustomersTimelineItem = z.object({
  at: IsoInstant,
  type: z.enum(["booking", "groom", "stay", "daycare", "bill", "report_card", "note"]),
  title: z.string(),
  petName: z.string().nullable(),
  amountSatang: Money.nullable(),
  refId: Uuid,
});
export type CustomersTimelineItem = z.infer<typeof CustomersTimelineItem>;
export const CustomersTimelineResponse = Paged(CustomersTimelineItem);
export type CustomersTimelineResponse = z.infer<typeof CustomersTimelineResponse>;
