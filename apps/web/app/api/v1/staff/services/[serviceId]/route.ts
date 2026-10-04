import { ServicesUpdateParams, ServicesUpdateRequest } from "@app/contracts/endpoints/services.update";
import { withStaff } from "@app/server/http";
import { servicesUpdate } from "@app/server/services/services/update";
export const PATCH = withStaff("services.update", { params: ServicesUpdateParams, body: ServicesUpdateRequest }, servicesUpdate);
