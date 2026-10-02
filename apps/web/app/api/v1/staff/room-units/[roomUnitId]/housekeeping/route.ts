import { RoomUnitsHousekeepingParams, RoomUnitsHousekeepingRequest } from "@app/contracts/endpoints/roomUnits.housekeeping";
import { withStaff } from "@app/server/http";
import { roomUnitsHousekeeping } from "@app/server/services/roomUnits/housekeeping";

export const PATCH = withStaff(
  "roomUnits.housekeeping",
  { body: RoomUnitsHousekeepingRequest, params: RoomUnitsHousekeepingParams },
  roomUnitsHousekeeping,
);
