import { LiffAddVaccinationParams, LiffAddVaccinationRequest } from "@app/contracts/endpoints/liff.addVaccination";
import { withCustomer } from "@app/server/http";
import { liffAddVaccination } from "@app/server/services/liff/addVaccination";

export const POST = withCustomer(
  "liff.addVaccination",
  { params: LiffAddVaccinationParams, body: LiffAddVaccinationRequest },
  liffAddVaccination,
);
