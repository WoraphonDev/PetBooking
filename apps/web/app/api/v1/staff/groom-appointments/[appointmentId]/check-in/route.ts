import { GroomCheckInParams, GroomCheckInRequest } from "@app/contracts/endpoints/groom.checkIn";
import { withStaff } from "@app/server/http";
import { groomCheckIn } from "@app/server/services/groom/checkIn";

export const POST = withStaff("groom.checkIn", { body: GroomCheckInRequest, params: GroomCheckInParams }, groomCheckIn);
