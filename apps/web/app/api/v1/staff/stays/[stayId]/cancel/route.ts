import { StaysCancelParams, StaysCancelRequest } from "@app/contracts/endpoints/stays.cancel";
import { withStaff } from "@app/server/http";
import { staysCancel } from "@app/server/services/stays/cancel";

export const POST = withStaff("stays.cancel", { body: StaysCancelRequest, params: StaysCancelParams }, staysCancel);
