import { z } from "zod";
import { Paged } from "../common.ts";
import { CustomerListItem } from "../dto/customer-list-item.ts";

export const customersSort = z.enum(["last_visit_desc", "name_asc", "created_desc"]);
export type CustomersSort = z.infer<typeof customersSort>;

export const CustomersListQuery = z.object({
  /** same matching as search.quick: names/nickname, phone prefix (R-22), pet name */
  q: z.string().trim().optional(),
  sort: customersSort.default("last_visit_desc"),
  cursor: z.string().min(1).optional(),
  // 05 §0 pagination convention
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CustomersListQuery = z.infer<typeof CustomersListQuery>;
export const CustomersListRequest = CustomersListQuery;
export type CustomersListRequest = CustomersListQuery;
export const CustomersListResponse = Paged(CustomerListItem);
export type CustomersListResponse = z.infer<typeof CustomersListResponse>;
