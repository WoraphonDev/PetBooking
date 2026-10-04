import { BookingsDeclineParams, BookingsDeclineRequest } from "@app/contracts/endpoints/bookings.decline";
import { withStaff } from "@app/server/http";
import { bookingsDecline } from "@app/server/services/bookings/decline";

export const POST = withStaff("bookings.decline", { body: BookingsDeclineRequest, params: BookingsDeclineParams }, bookingsDecline);
