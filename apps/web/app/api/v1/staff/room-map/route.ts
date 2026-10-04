import { RoomMapGetQuery } from "@app/contracts/endpoints/roomMap.get";
import { withStaff } from "@app/server/http";
import { roomMapGet } from "@app/server/services/roomMap/get";

export const GET = withStaff("roomMap.get", { query: RoomMapGetQuery }, roomMapGet);
