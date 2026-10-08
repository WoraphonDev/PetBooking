import { LiffCancelParams, LiffCancelRequest } from "@app/contracts/endpoints/liff.cancel";
import { withCustomer } from "@app/server/http";
import { liffCancel } from "@app/server/services/liff/cancel";

export const POST = withCustomer("liff.cancel", { params: LiffCancelParams, body: LiffCancelRequest }, liffCancel);
