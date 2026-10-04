import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { housekeepingStatus, roomUnitStatus } from "../enums.ts";
import { StayCard } from "./stay-card.ts";

/** 05#dto-RoomMap — the branch's rooms on one local date. */
export const RoomMap = z.object({
  date: LocalDate,
  units: z.array(
    z.object({
      id: Uuid,
      code: z.string(),
      zone: z.string().nullable(),
      roomTypeName: z.string(),
      status: roomUnitStatus,
      housekeeping: housekeepingStatus,
      occupant: StayCard.nullable(),
      arrivingToday: z.boolean(),
      departingToday: z.boolean(),
      nextArrivalDate: LocalDate.nullable(),
    }),
  ),
});
export type RoomMap = z.infer<typeof RoomMap>;
