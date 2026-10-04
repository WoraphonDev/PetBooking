import { DaycareNoShowParams, DaycareNoShowRequest } from "@app/contracts/endpoints/daycare.no_show";
import { withStaff } from "@app/server/http";
import { daycareNoShow } from "@app/server/services/daycare/no_show";

export const POST = withStaff("daycare.no_show", { body: DaycareNoShowRequest, params: DaycareNoShowParams }, daycareNoShow);
