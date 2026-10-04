import { GroomRemoveSurchargeParams } from "@app/contracts/endpoints/groom.removeSurcharge";
import { withStaff } from "@app/server/http";
import { groomRemoveSurcharge } from "@app/server/services/groom/removeSurcharge";

export const DELETE = withStaff("groom.removeSurcharge", { params: GroomRemoveSurchargeParams }, groomRemoveSurcharge);
