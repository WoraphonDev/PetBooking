import { LiffBookingsParams, LiffBookingsQuery } from "@app/contracts/endpoints/liff.bookings";
import { withCustomer } from "@app/server/http";
import { liffBookings } from "@app/server/services/liff/bookings";

export const GET = withCustomer("liff.bookings", { params: LiffBookingsParams, query: LiffBookingsQuery }, liffBookings);
