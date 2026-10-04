import { BookingsCancelPreviewParams, BookingsCancelPreviewQuery } from "@app/contracts/endpoints/bookings.cancelPreview";
import { withStaff } from "@app/server/http";
import { bookingsCancelPreview } from "@app/server/services/bookings/cancelPreview";

export const GET = withStaff(
  "bookings.cancelPreview",
  { query: BookingsCancelPreviewQuery, params: BookingsCancelPreviewParams },
  bookingsCancelPreview,
);
