import { AvailabilityGroomSlotsRequest } from "@app/contracts/endpoints/availability.groomSlots";
import { withStaff } from "@app/server/http";
import { availabilityGroomSlots } from "@app/server/services/availability/groomSlots";

export const POST = withStaff("availability.groomSlots", { body: AvailabilityGroomSlotsRequest }, availabilityGroomSlots);
