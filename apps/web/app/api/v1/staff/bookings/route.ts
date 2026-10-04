import { BookingsCreateRequest } from "@app/contracts/endpoints/bookings.create";
import { withStaff } from "@app/server/http";
import { bookingsCreate } from "@app/server/services/bookings/create";

export const POST = withStaff("bookings.create", { body: BookingsCreateRequest }, bookingsCreate);
