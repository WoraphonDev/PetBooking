import { z } from "zod";
import { SurchargeTypeItem } from "../dto/surcharge-type-item.ts";

export const SurchargeTypesListRequest = z.strictObject({});
export type SurchargeTypesListRequest = z.infer<typeof SurchargeTypesListRequest>;
export const SurchargeTypesListResponse = z.array(SurchargeTypeItem);
export type SurchargeTypesListResponse = z.infer<typeof SurchargeTypesListResponse>;
