import { DaycareCancelParams, DaycareCancelRequest } from "@app/contracts/endpoints/daycare.cancel";
import { withStaff } from "@app/server/http";
import { daycareCancel } from "@app/server/services/daycare/cancel";

export const POST = withStaff("daycare.cancel", { body: DaycareCancelRequest, params: DaycareCancelParams }, daycareCancel);
