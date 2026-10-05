import { VaccinationsCreateParams, VaccinationsCreateRequest } from "@app/contracts/endpoints/vaccinations.create";
import { withStaff } from "@app/server/http";
import { vaccinationsCreate } from "@app/server/services/vaccinations/create";

export const POST = withStaff(
  "vaccinations.create",
  { body: VaccinationsCreateRequest, params: VaccinationsCreateParams },
  vaccinationsCreate,
);
