import { z } from "zod";
import { LocalDate } from "../common.ts";
import { closureScope } from "../enums.ts";

export const ClosuresImportHolidaysRequest = z.object({
  year: z.number().int(),
  dates: z.array(LocalDate.pipe(z.iso.date())),
  scope: closureScope,
});
export type ClosuresImportHolidaysRequest = z.infer<typeof ClosuresImportHolidaysRequest>;
export const ClosuresImportHolidaysResponse = z.undefined();
export type ClosuresImportHolidaysResponse = z.infer<typeof ClosuresImportHolidaysResponse>;
