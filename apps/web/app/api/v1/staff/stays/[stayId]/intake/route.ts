import { StaysSaveIntakeParams, StaysSaveIntakeRequest } from "@app/contracts/endpoints/stays.saveIntake";
import { withStaff } from "@app/server/http";
import { staysSaveIntake } from "@app/server/services/stays/saveIntake";

export const PUT = withStaff("stays.saveIntake", { body: StaysSaveIntakeRequest, params: StaysSaveIntakeParams }, staysSaveIntake);
