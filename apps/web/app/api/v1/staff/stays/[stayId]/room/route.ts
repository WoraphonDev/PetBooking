import { StaysChangeRoomParams, StaysChangeRoomRequest } from "@app/contracts/endpoints/stays.changeRoom";
import { withStaff } from "@app/server/http";
import { staysChangeRoom } from "@app/server/services/stays/changeRoom";

export const PATCH = withStaff("stays.changeRoom", { body: StaysChangeRoomRequest, params: StaysChangeRoomParams }, staysChangeRoom);
