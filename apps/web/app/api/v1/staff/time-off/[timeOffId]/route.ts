import { TimeOffDeleteRequest } from "@app/contracts/endpoints/timeOff.delete";
import { withStaff } from "@app/server/http";
import { timeOffDelete } from "@app/server/services/timeOff/delete";

export const DELETE = withStaff("timeOff.delete", { params: TimeOffDeleteRequest }, timeOffDelete);
