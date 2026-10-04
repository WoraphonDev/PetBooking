import { BookingsApproveParams } from "@app/contracts/endpoints/bookings.approve";
import { withStaff } from "@app/server/http";
import { bookingsApprove } from "@app/server/services/bookings/approve";

export const POST = withStaff("bookings.approve", { params: BookingsApproveParams }, bookingsApprove);
