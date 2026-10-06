import { LiffPayUploadSlipParams, LiffPayUploadSlipRequest } from "@app/contracts/endpoints/liff.payUploadSlip";
import { withCustomer } from "@app/server/http";
import { liffPayUploadSlip } from "@app/server/services/liff/payUploadSlip";

export const POST = withCustomer(
  "liff.payUploadSlip",
  { params: LiffPayUploadSlipParams, body: LiffPayUploadSlipRequest },
  liffPayUploadSlip,
);
