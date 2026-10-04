import { BookingsGetParams } from "@app/contracts/endpoints/bookings.get";
import { withStaff } from "@app/server/http";
import { bookingsGet } from "@app/server/services/bookings/get";

export const GET = withStaff("bookings.get", { params: BookingsGetParams }, bookingsGet);
