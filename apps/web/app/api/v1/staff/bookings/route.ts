import { BookingsCreateRequest } from "@app/contracts/endpoints/bookings.create";
import { BookingsListQuery } from "@app/contracts/endpoints/bookings.list";
import { withStaff } from "@app/server/http";
import { bookingsCreate } from "@app/server/services/bookings/create";
import { bookingsList } from "@app/server/services/bookings/list";

export const GET = withStaff("bookings.list", { query: BookingsListQuery }, bookingsList);
export const POST = withStaff("bookings.create", { body: BookingsCreateRequest }, bookingsCreate);
