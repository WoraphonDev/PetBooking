import { z } from "zod";
import { LocalDate } from "../common.ts";
import { RoomMap } from "../dto/room-map.ts";

export const RoomMapGetQuery = z.strictObject({ date: LocalDate });
export const RoomMapGetRequest = RoomMapGetQuery;
export type RoomMapGetRequest = z.infer<typeof RoomMapGetRequest>;
export const RoomMapGetResponse = RoomMap;
export type RoomMapGetResponse = z.infer<typeof RoomMapGetResponse>;
