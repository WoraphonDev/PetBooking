import { BookingsWaiveDepositParams, BookingsWaiveDepositRequest } from "@app/contracts/endpoints/bookings.waiveDeposit";
import { withStaff } from "@app/server/http";
import { bookingsWaiveDeposit } from "@app/server/services/bookings/waiveDeposit";

export const POST = withStaff(
  "bookings.waiveDeposit",
  { body: BookingsWaiveDepositRequest, params: BookingsWaiveDepositParams },
  bookingsWaiveDeposit,
);
