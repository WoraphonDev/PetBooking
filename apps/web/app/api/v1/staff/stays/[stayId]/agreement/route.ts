import { StaysSignAgreementParams, StaysSignAgreementRequest } from "@app/contracts/endpoints/stays.signAgreement";
import { withStaff } from "@app/server/http";
import { staysSignAgreement } from "@app/server/services/stays/signAgreement";

export const POST = withStaff(
  "stays.signAgreement",
  { body: StaysSignAgreementRequest, params: StaysSignAgreementParams },
  staysSignAgreement,
);
