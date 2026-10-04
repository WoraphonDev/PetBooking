import { GroomRescheduleParams, GroomRescheduleRequest } from "@app/contracts/endpoints/groom.reschedule";
import { withStaff } from "@app/server/http";
import { groomReschedule } from "@app/server/services/groom/reschedule";

export const PATCH = withStaff("groom.reschedule", { body: GroomRescheduleRequest, params: GroomRescheduleParams }, groomReschedule);
