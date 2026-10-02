import { z } from "zod";
import { BookingListItem } from "../dto/booking-list-item.ts";
import { CustomerListItem } from "../dto/customer-list-item.ts";

export const SearchQuickQuery = z.object({ q: z.string().trim().min(2) });
export type SearchQuickQuery = z.infer<typeof SearchQuickQuery>;
export const SearchQuickRequest = SearchQuickQuery;
export type SearchQuickRequest = SearchQuickQuery;
export const SearchQuickResponse = z.object({ customers: z.array(CustomerListItem), bookings: z.array(BookingListItem) });
export type SearchQuickResponse = z.infer<typeof SearchQuickResponse>;
