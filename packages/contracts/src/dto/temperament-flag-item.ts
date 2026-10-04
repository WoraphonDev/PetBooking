import { z } from "zod";
import { temperamentFlag } from "../enums.ts";
export const TemperamentFlagItem = z.object({ flag: temperamentFlag, note: z.string().nullable() });
export type TemperamentFlagItem = z.infer<typeof TemperamentFlagItem>;
