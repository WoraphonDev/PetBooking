import { z } from "zod";
import { Uuid } from "../common.ts";
import { species } from "../enums.ts";

export const SizeTierItem = z.object({
  id: Uuid,
  species,
  code: z.string(),
  labelTh: z.string(),
  minWeightGrams: z.number().int(),
  maxWeightGrams: z.number().int().nullable(),
  sortOrder: z.number().int(),
});
export type SizeTierItem = z.infer<typeof SizeTierItem>;
