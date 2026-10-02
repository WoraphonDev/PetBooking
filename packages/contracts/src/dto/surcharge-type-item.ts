import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { recordStatus } from "../enums.ts";

export const SurchargeTypeItem = z.object({
  id: Uuid,
  nameTh: z.string(),
  defaultAmountSatang: Money,
  status: recordStatus,
});
export type SurchargeTypeItem = z.infer<typeof SurchargeTypeItem>;
