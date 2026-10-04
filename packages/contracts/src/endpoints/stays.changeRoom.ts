import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayCard } from "../dto/stay-card.ts";

export const StaysChangeRoomParams = z.object({ stayId: Uuid });
export const StaysChangeRoomRequest = z.object({ roomUnitId: Uuid });
export type StaysChangeRoomRequest = z.infer<typeof StaysChangeRoomRequest>;
export const StaysChangeRoomResponse = StayCard;
export type StaysChangeRoomResponse = z.infer<typeof StaysChangeRoomResponse>;
