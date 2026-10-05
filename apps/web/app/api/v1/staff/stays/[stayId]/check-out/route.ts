import { StaysCheckOutParams, StaysCheckOutRequest } from "@app/contracts/endpoints/stays.checkOut";
import { withStaff } from "@app/server/http";
import { staysCheckOut } from "@app/server/services/stays/checkOut";

export const POST = withStaff("stays.checkOut", { body: StaysCheckOutRequest, params: StaysCheckOutParams }, staysCheckOut);
