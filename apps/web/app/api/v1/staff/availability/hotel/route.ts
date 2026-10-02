import { AvailabilityHotelRequest } from "@app/contracts/endpoints/availability.hotel";
import { withStaff } from "@app/server/http";
import { availabilityHotel } from "@app/server/services/availability/hotel";

export const GET = withStaff("availability.hotel", { query: AvailabilityHotelRequest }, availabilityHotel);
