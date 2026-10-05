import { VaccinationsVerifyParams, VaccinationsVerifyRequest } from "@app/contracts/endpoints/vaccinations.verify";
import { withStaff } from "@app/server/http";
import { vaccinationsVerify } from "@app/server/services/vaccinations/verify";

export const POST = withStaff(
  "vaccinations.verify",
  { body: VaccinationsVerifyRequest, params: VaccinationsVerifyParams },
  vaccinationsVerify,
);
