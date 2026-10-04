import { z } from "zod";
import { IsoInstant } from "../common.ts";
import { recordSource } from "../enums.ts";
export const WeightItem = z.object({ weightGrams: z.number().int(), measuredAt: IsoInstant, source: recordSource });
export type WeightItem = z.infer<typeof WeightItem>;
