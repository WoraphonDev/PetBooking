import { DaycareCheckOutParams } from "@app/contracts/endpoints/daycare.check_out";
import { withStaff } from "@app/server/http";
import { daycareCheckOut } from "@app/server/services/daycare/check_out";

export const POST = withStaff("daycare.check_out", { params: DaycareCheckOutParams }, daycareCheckOut);
