import { AvailabilityDaycareRequest } from "@app/contracts/endpoints/availability.daycare";
import { withStaff } from "@app/server/http";
import { availabilityDaycare } from "@app/server/services/availability/daycare";

export const GET = withStaff("availability.daycare", { query: AvailabilityDaycareRequest }, availabilityDaycare);
