import { z } from "zod";
import { IsoInstant, LocalDate, Uuid } from "../common.ts";
import { closureScope, closureSource } from "../enums.ts";

/** YYYY-MM-DD that exists on the calendar (LocalDate checks the shape only) */
const CalendarDate = LocalDate.pipe(z.iso.date());

export const ClosuresListQuery = z
  .object({
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "to must not be before from" });
export type ClosuresListQuery = z.infer<typeof ClosuresListQuery>;
export const ClosuresListRequest = ClosuresListQuery;
export type ClosuresListRequest = ClosuresListQuery;

/** branch_closure.* */
export const ClosureItem = z.object({
  id: Uuid,
  branchId: Uuid,
  startsAt: IsoInstant,
  endsAt: IsoInstant,
  scope: closureScope,
  source: closureSource,
  reason: z.string().nullable(),
  createdBy: Uuid.nullable(),
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
});
export type ClosureItem = z.infer<typeof ClosureItem>;
export const ClosuresListResponse = z.array(ClosureItem);
export type ClosuresListResponse = z.infer<typeof ClosuresListResponse>;
