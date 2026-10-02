import { BookingsBalanceLinkParams, BookingsBalanceLinkRequest } from "@app/contracts/endpoints/bookings.balanceLink";
import { withStaff } from "@app/server/http";
import { bookingsBalanceLink } from "@app/server/services/bookings/balanceLink";

export const POST = withStaff(
  "bookings.balanceLink",
  { body: BookingsBalanceLinkRequest, params: BookingsBalanceLinkParams },
  bookingsBalanceLink,
);
