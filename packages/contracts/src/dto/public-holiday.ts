import { z } from "zod";
import { LocalDate } from "../common.ts";
export const PublicHoliday = z.object({ date: LocalDate.pipe(z.iso.date()), nameTh: z.string() });
export type PublicHoliday = z.infer<typeof PublicHoliday>;
