import { z } from "zod";
import { Uuid } from "../common.ts";
import { RoomUnitItem } from "../dto/room-unit-item.ts";
import { housekeepingStatus } from "../enums.ts";

export const RoomUnitsHousekeepingParams = z.object({ roomUnitId: Uuid });
export const RoomUnitsHousekeepingRequest = z.object({ housekeeping: housekeepingStatus });
export type RoomUnitsHousekeepingRequest = z.infer<typeof RoomUnitsHousekeepingRequest>;
export const RoomUnitsHousekeepingResponse = RoomUnitItem;
export type RoomUnitsHousekeepingResponse = z.infer<typeof RoomUnitsHousekeepingResponse>;
