import { z } from "zod";
import { RoomUnitItem } from "../dto/room-unit-item.ts";

/** no query parameters (organization/branch come from the session) */
export const RoomUnitsListRequest = z.strictObject({});
export type RoomUnitsListRequest = z.infer<typeof RoomUnitsListRequest>;
export const RoomUnitsListResponse = z.array(RoomUnitItem);
export type RoomUnitsListResponse = z.infer<typeof RoomUnitsListResponse>;
