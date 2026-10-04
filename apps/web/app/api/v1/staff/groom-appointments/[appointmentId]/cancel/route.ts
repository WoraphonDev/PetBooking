import { GroomCancelParams, GroomCancelRequest } from "@app/contracts/endpoints/groom.cancel";
import { withStaff } from "@app/server/http";
import { groomCancel } from "@app/server/services/groom/cancel";

export const POST = withStaff("groom.cancel", { body: GroomCancelRequest, params: GroomCancelParams }, groomCancel);
