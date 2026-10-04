import { z } from "zod";
import { LocalDate, Paged, Uuid } from "../common.ts";
import { BookingListItem } from "../dto/booking-list-item.ts";
import { bookingStatus } from "../enums.ts";

const CalendarDate = LocalDate.pipe(z.iso.date());

export const BookingsListQuery = z
  .object({
    /** several values: ?status=a&status=b */
    status: z
      .union([bookingStatus, z.array(bookingStatus)])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .optional(),
    /** branch-local days of first_service_at */
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
    customerId: Uuid.optional(),
    cursor: z.string().min(1).optional(),
    // 05 §0 pagination convention
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "to must not be before from" });
export type BookingsListQuery = z.infer<typeof BookingsListQuery>;
export const BookingsListRequest = BookingsListQuery;
export type BookingsListRequest = BookingsListQuery;
export const BookingsListResponse = Paged(BookingListItem);
export type BookingsListResponse = z.infer<typeof BookingsListResponse>;
