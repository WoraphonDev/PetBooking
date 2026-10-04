import { BookingsCancelParams, BookingsCancelRequest } from "@app/contracts/endpoints/bookings.cancel";
import { withStaff } from "@app/server/http";
import { bookingsCancel } from "@app/server/services/bookings/cancel";

export const POST = withStaff("bookings.cancel", { body: BookingsCancelRequest, params: BookingsCancelParams }, bookingsCancel);
