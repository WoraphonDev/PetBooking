import { z } from "zod";
import { LocalDate, Paged } from "../common.ts";
import { AuditLogItem } from "../dto/audit-log-item.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.refine((d) => {
  const [y, m, day] = d.split("-").map(Number);
  const cal = new Date(Date.UTC(y ?? 0, (m ?? 0) - 1, day ?? 0));
  return cal.getUTCFullYear() === y && cal.getUTCMonth() === (m ?? 0) - 1 && cal.getUTCDate() === day;
}, "invalid date");

export const AuditListRequest = z
  .object({
    action: z.string().min(1).optional(),
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
    cursor: z.string().min(1).optional(),
    // 05 §0 pagination convention
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "to must not be before from" });
export type AuditListRequest = z.infer<typeof AuditListRequest>;
export const AuditListResponse = Paged(AuditLogItem);
export type AuditListResponse = z.infer<typeof AuditListResponse>;
