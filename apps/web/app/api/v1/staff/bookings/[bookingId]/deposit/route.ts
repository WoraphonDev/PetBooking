import { BookingsRecordDepositParams, BookingsRecordDepositRequest } from "@app/contracts/endpoints/bookings.recordDeposit";
import { withStaff } from "@app/server/http";
import { bookingsRecordDeposit } from "@app/server/services/bookings/recordDeposit";

export const POST = withStaff(
  "bookings.recordDeposit",
  { body: BookingsRecordDepositRequest, params: BookingsRecordDepositParams },
  bookingsRecordDeposit,
);
