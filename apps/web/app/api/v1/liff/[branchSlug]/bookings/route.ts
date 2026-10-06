import { LiffBookingsParams, LiffBookingsQuery } from "@app/contracts/endpoints/liff.bookings";
import { LiffCreateBookingParams, LiffCreateBookingRequest } from "@app/contracts/endpoints/liff.createBooking";
import { withCustomer } from "@app/server/http";
import { liffBookings } from "@app/server/services/liff/bookings";
import { liffCreateBooking } from "@app/server/services/liff/createBooking";

export const GET = withCustomer("liff.bookings", { params: LiffBookingsParams, query: LiffBookingsQuery }, liffBookings);

export const POST = withCustomer(
  "liff.createBooking",
  { params: LiffCreateBookingParams, body: LiffCreateBookingRequest },
  liffCreateBooking,
);
