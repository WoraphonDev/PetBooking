import { TimeOffCreateRequest } from "@app/contracts/endpoints/timeOff.create";
import { TimeOffListQuery } from "@app/contracts/endpoints/timeOff.list";
import { withStaff } from "@app/server/http";
import { timeOffCreate } from "@app/server/services/timeOff/create";
import { timeOffList } from "@app/server/services/timeOff/list";

export const GET = withStaff("timeOff.list", { query: TimeOffListQuery }, timeOffList);
export const POST = withStaff("timeOff.create", { body: TimeOffCreateRequest }, timeOffCreate);
