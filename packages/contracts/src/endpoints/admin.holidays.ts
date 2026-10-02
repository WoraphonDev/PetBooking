import { z } from "zod";
import { LocalDate } from "../common.ts";

/** path `{year}` (ค.ศ.) */
export const AdminHolidaysParams = z.object({ year: z.coerce.number().int().min(1000).max(9999) });
export type AdminHolidaysParams = z.infer<typeof AdminHolidaysParams>;

export const AdminHolidaysRequest = z
  .object({
    days: z.array(z.object({ date: LocalDate.pipe(z.iso.date()), nameTh: z.string().trim().min(1) })),
  })
  .superRefine((b, issue) => {
    const seen = new Set<string>();
    b.days.forEach((d, i) => {
      if (seen.has(d.date)) issue.addIssue({ code: "custom", path: ["days", i, "date"], message: "duplicate date" });
      seen.add(d.date);
    });
  });
export type AdminHolidaysRequest = z.infer<typeof AdminHolidaysRequest>;
export const AdminHolidaysResponse = z.undefined();
export type AdminHolidaysResponse = z.infer<typeof AdminHolidaysResponse>;
