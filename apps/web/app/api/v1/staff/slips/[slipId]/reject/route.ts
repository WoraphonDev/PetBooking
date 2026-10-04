import { SlipsRejectParams, SlipsRejectRequest } from "@app/contracts/endpoints/slips.reject";
import { withStaff } from "@app/server/http";
import { slipsReject } from "@app/server/services/slips/reject";

export const POST = withStaff("slips.reject", { body: SlipsRejectRequest, params: SlipsRejectParams }, slipsReject);
