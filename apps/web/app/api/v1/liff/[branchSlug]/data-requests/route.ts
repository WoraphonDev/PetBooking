import { LiffDataRequestParams, LiffDataRequestRequest } from "@app/contracts/endpoints/liff.dataRequest";
import { withCustomer } from "@app/server/http";
import { liffDataRequest } from "@app/server/services/liff/dataRequest";

export const POST = withCustomer("liff.dataRequest", { params: LiffDataRequestParams, body: LiffDataRequestRequest }, liffDataRequest);
