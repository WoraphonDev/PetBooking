import { z } from "zod";
import { LocalDate, Paged } from "../common.ts";
import { BillListItem } from "../dto/bill-list-item.ts";
import { billStatus } from "../enums.ts";

export const BillsListQuery = z.object({
  status: billStatus.optional(),
  /** branch-local day of closed_at (paid) or opened_at (open/void) — Q-0055 */
  date: LocalDate.pipe(z.iso.date()).optional(),
  cursor: z.string().min(1).optional(),
  // 05 §0 pagination convention
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type BillsListQuery = z.infer<typeof BillsListQuery>;
export const BillsListRequest = BillsListQuery;
export type BillsListRequest = BillsListQuery;
export const BillsListResponse = Paged(BillListItem);
export type BillsListResponse = z.infer<typeof BillsListResponse>;
