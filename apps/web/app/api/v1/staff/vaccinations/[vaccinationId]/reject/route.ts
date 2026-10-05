import { VaccinationsRejectParams, VaccinationsRejectRequest } from "@app/contracts/endpoints/vaccinations.reject";
import { withStaff } from "@app/server/http";
import { vaccinationsReject } from "@app/server/services/vaccinations/reject";

export const POST = withStaff(
  "vaccinations.reject",
  { body: VaccinationsRejectRequest, params: VaccinationsRejectParams },
  vaccinationsReject,
);
