import { RoomUnitsListRequest } from "@app/contracts/endpoints/roomUnits.list";
import { RoomUnitsUpsertRequest } from "@app/contracts/endpoints/roomUnits.upsert";
import { withStaff } from "@app/server/http";
import { roomUnitsList } from "@app/server/services/roomUnits/list";
import { roomUnitsUpsert } from "@app/server/services/roomUnits/upsert";

export const GET = withStaff("roomUnits.list", { query: RoomUnitsListRequest }, roomUnitsList);
export const PUT = withStaff("roomUnits.upsert", { body: RoomUnitsUpsertRequest }, roomUnitsUpsert);
