import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

export const StaysPostUpdateParams = z.object({ stayId: Uuid });
export const StaysPostUpdateRequest = z.object({
  /** stay_update files (kind checked when committed) */
  fileIds: z.array(Uuid).min(1).max(6),
  caption: z.string().trim().max(200).optional(),
  notifyCustomer: z.boolean().default(true),
});
export type StaysPostUpdateRequest = z.infer<typeof StaysPostUpdateRequest>;
export const StaysPostUpdateResponse = StayDetail;
export type StaysPostUpdateResponse = z.infer<typeof StaysPostUpdateResponse>;
