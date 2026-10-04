import { DaycareCheckInParams } from "@app/contracts/endpoints/daycare.check_in";
import { withStaff } from "@app/server/http";
import { daycareCheckIn } from "@app/server/services/daycare/check_in";

export const POST = withStaff("daycare.check_in", { params: DaycareCheckInParams }, daycareCheckIn);
