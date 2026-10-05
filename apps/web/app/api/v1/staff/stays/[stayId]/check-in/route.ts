import { StaysCheckInParams, StaysCheckInRequest } from "@app/contracts/endpoints/stays.checkIn";
import { withStaff } from "@app/server/http";
import { staysCheckIn } from "@app/server/services/stays/checkIn";

export const POST = withStaff("stays.checkIn", { body: StaysCheckInRequest, params: StaysCheckInParams }, staysCheckIn);
