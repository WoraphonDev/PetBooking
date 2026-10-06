import { LiffUploadSlipParams, LiffUploadSlipRequest } from "@app/contracts/endpoints/liff.uploadSlip";
import { withCustomer } from "@app/server/http";
import { liffUploadSlip } from "@app/server/services/liff/uploadSlip";

export const POST = withCustomer("liff.uploadSlip", { params: LiffUploadSlipParams, body: LiffUploadSlipRequest }, liffUploadSlip);
