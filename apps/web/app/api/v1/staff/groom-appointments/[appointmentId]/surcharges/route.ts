import { GroomAddSurchargeParams, GroomAddSurchargeRequest } from "@app/contracts/endpoints/groom.addSurcharge";
import { withStaff } from "@app/server/http";
import { groomAddSurcharge } from "@app/server/services/groom/addSurcharge";

export const POST = withStaff("groom.addSurcharge", { body: GroomAddSurchargeRequest, params: GroomAddSurchargeParams }, groomAddSurcharge);
