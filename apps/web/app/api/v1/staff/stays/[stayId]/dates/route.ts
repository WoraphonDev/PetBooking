import { StaysChangeDatesParams, StaysChangeDatesRequest } from "@app/contracts/endpoints/stays.changeDates";
import { withStaff } from "@app/server/http";
import { staysChangeDates } from "@app/server/services/stays/changeDates";

export const PATCH = withStaff("stays.changeDates", { body: StaysChangeDatesRequest, params: StaysChangeDatesParams }, staysChangeDates);
