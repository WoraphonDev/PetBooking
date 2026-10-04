import { SlipsVerifyParams, SlipsVerifyRequest } from "@app/contracts/endpoints/slips.verify";
import { withStaff } from "@app/server/http";
import { slipsVerify } from "@app/server/services/slips/verify";

export const POST = withStaff("slips.verify", { body: SlipsVerifyRequest, params: SlipsVerifyParams }, slipsVerify);
