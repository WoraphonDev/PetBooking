import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { SurchargeTypeItem } from "../dto/surcharge-type-item.ts";
import { recordStatus } from "../enums.ts";

export const SurchargeTypesUpsertRequest = z.object({
  items: z.array(
    z.object({
      id: Uuid.optional(),
      nameTh: z.string().min(1).max(60),
      defaultAmountSatang: Money.min(0),
      status: recordStatus,
    }),
  ),
});
export type SurchargeTypesUpsertRequest = z.infer<typeof SurchargeTypesUpsertRequest>;
export const SurchargeTypesUpsertResponse = z.array(SurchargeTypeItem);
export type SurchargeTypesUpsertResponse = z.infer<typeof SurchargeTypesUpsertResponse>;
