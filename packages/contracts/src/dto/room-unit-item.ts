import { z } from "zod";
import { Uuid } from "../common.ts";
import { housekeepingStatus, roomUnitStatus } from "../enums.ts";

/** 05#dto-RoomUnitItem */
export const RoomUnitItem = z.object({
  id: Uuid,
  roomTypeId: Uuid,
  code: z.string(),
  zone: z.string().nullable(),
  status: roomUnitStatus,
  housekeeping: housekeepingStatus,
  sortOrder: z.number().int(),
});
export type RoomUnitItem = z.infer<typeof RoomUnitItem>;
